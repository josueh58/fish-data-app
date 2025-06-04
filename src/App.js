import { useState, useEffect, Component } from 'react';
import { db } from './firebase';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, getDoc, setDoc } from 'firebase/firestore';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { fromLatLon, toLatLon } from 'utm';
import speciesData from './speciesData';
import './App.css';
import 'leaflet/dist/leaflet.css';
import SignIn from './SignIn';
import SignUp from './SignUp';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import Admin from './Admin';
import { Pie } from 'react-chartjs-2';
import { ArcElement } from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  annotationPlugin,
  ArcElement // Register ArcElement for pie charts
);

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const dietContentOptions = [
  'Empty',
  'Zooplankton', 
  'Aquatic Insects',
  'Terrestrial Insects',
  'Chironomids',
  'Yellow Perch',
  'Bluegill',
  'Fish Parts',
  'Aquatic Plants',
  'Worms',
  'Other'
]; // Diet content options for fish stomach analysis

function App() {
  const [view, setView] = useState('signIn');
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [permissions, setPermissions] = useState({ canEdit: false, canDelete: false });
  const [eventData, setEventData] = useState({
    lake: '', location: '', date: '', observers: '', gear: '',
    cond: '', pH: '', tdS: '', salts: '', temp_water_c: '', amps: '', field_notes: ''
  });
  const [currentEvent, setCurrentEvent] = useState(null);
  const [pastEvents, setPastEvents] = useState([]);
  const [gearType, setGearType] = useState('');
  const [selectedTransect, setSelectedTransect] = useState(null);
  const [fishData, setFishData] = useState({ spp: '', length: '', weight: '', stomach_content: '', sex: '', fats: '', notes: '', count: 1 });
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [showEditNetModal, setShowEditNetModal] = useState(false);
  const [editingSetId, setEditingSetId] = useState(null);
  const [editNetData, setEditNetData] = useState({ pull_datetime: '', latitude: '', longitude: '' });
  const [selectedFishIndices, setSelectedFishIndices] = useState([]);
  const [selectedEventIndices, setSelectedEventIndices] = useState([]);
  const [showModal, setShowModal] = useState(null); // null, 'environmental', 'transect', 'fish'
  const [resultsModal, setResultsModal] = useState(null); // null, 'lengthFrequency', 'abundanceCondition', 'anglerAbundance'
  const [editingFishIndex, setEditingFishIndex] = useState(null); // null or index of fish being edited
  const [isViewOnly, setIsViewOnly] = useState(false); // New state for view-only mode
  // Reintroduce offline mode state
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  // State for lake names and selected lake
  const [lakeNames, setLakeNames] = useState([]);
  const [selectedLake, setSelectedLake] = useState('');
  const [isMapVisible, setIsMapVisible] = useState(false);
  const [selectedSpeciesForDiet, setSelectedSpeciesForDiet] = useState('');
  const [customDietContent, setCustomDietContent] = useState('');
  const [customDietEntries, setCustomDietEntries] = useState([]);
  const [selectedSpeciesForMap, setSelectedSpeciesForMap] = useState('');

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        // Set all users to 'editor' role by default
        setRole('editor');
        console.log('Role set to editor for all users');

        // Set permissions based on user role
        setPermissions({ canEdit: true, canDelete: true });

        setView('home');
      } else {
        setUser(null);
        setRole(null);
        setView('signIn');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Load custom diet entries from localStorage on app start
    const storedCustomDietEntries = JSON.parse(localStorage.getItem('customDietEntries') || '[]');
    setCustomDietEntries(storedCustomDietEntries);
  }, []);

  // Function to add a new custom diet entry
  const addCustomDietEntry = (newEntry) => {
    if (newEntry && !dietContentOptions.includes(newEntry) && !customDietEntries.includes(newEntry)) {
      const updatedCustomEntries = [...customDietEntries, newEntry];
      setCustomDietEntries(updatedCustomEntries);
      localStorage.setItem('customDietEntries', JSON.stringify(updatedCustomEntries));
    }
  };

  // Combine predefined and custom diet options
  const getAllDietOptions = () => {
    return [...dietContentOptions, ...customDietEntries];
  };

  const handleSignOut = () => {
    const auth = getAuth();
    signOut(auth);
  };

  useEffect(() => {
    const storedEvent = JSON.parse(localStorage.getItem('currentEvent') || 'null');
    if (storedEvent) {
      setCurrentEvent(storedEvent);
      setEventData({
        lake: storedEvent.location.lake || '',
        location: storedEvent.location.location || '',
        date: storedEvent.location.date || '',
        observers: storedEvent.location.observers || '',
        gear: storedEvent.location.gear || '',
        cond: storedEvent.environmental.cond || '',
        pH: storedEvent.environmental.pH || '',
        tdS: storedEvent.environmental.tdS || '',
        salts: storedEvent.environmental.salts || '',
        temp_water_c: storedEvent.environmental.temp_water_c || '',
        amps: storedEvent.environmental.amps || '',
        field_notes: storedEvent.location.field_notes || ''
      });
      setGearType(storedEvent.gear_type || '');
      setSelectedTransect(storedEvent.sets?.length > 0 ? storedEvent.sets[0].set_id : null);
    }

    const storedPastEvents = JSON.parse(localStorage.getItem('pastEvents') || '[]');
    console.log('Loaded past events from localStorage:', storedPastEvents); // Log loaded events
    setPastEvents(storedPastEvents);
  }, []);

  // Function to fetch unique lake names
  const fetchLakeNames = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'samplingEvents'));
      const lakeNames = new Set();
      querySnapshot.forEach(doc => {
        const lake = doc.data().location.lake;
        if (lake) lakeNames.add(lake);
      });
      return Array.from(lakeNames);
    } catch (error) {
      console.error('Error fetching lake names:', error);
      return [];
    }
  };

  // Fetch lake names on component mount
  useEffect(() => {
    const loadLakeNames = async () => {
      const names = await fetchLakeNames();
      setLakeNames(names);
    };
    loadLakeNames();
  }, []);

  // Update fetchEventsFromFirebase to fetch by lake name
  const fetchEventsFromFirebase = async () => {
    if (!selectedLake) {
      alert('Please select a lake to sync data.');
      return;
    }
    try {
      console.log('Syncing data from Firebase for lake:', selectedLake); // Log selected lake
      const eventsQuery = query(
        collection(db, 'samplingEvents'),
        where('location.lake', '==', selectedLake)
      );
      const querySnapshot = await getDocs(eventsQuery);
      console.log('Query snapshot size:', querySnapshot.size); // Log the number of documents fetched
      const events = querySnapshot.docs.map(doc => ({ ...doc.data(), firebaseId: doc.id }));
      console.log('Fetched events:', events); // Log the fetched events
      setPastEvents(events);
      localStorage.setItem('pastEvents', JSON.stringify(events));
      alert(`Data synced successfully from Firebase. Total events: ${events.length}`);
    } catch (error) {
      console.error('Error syncing data from Firebase:', error); // Log error details
      alert('Error syncing data from Firebase: ' + error.message);
    }
  };

  const deleteSurvey = async (event, index) => {
    if (!window.confirm(`Are you sure you want to delete the survey for ${event.location.lake} on ${event.location.date} locally from this device?`)) {
      return;
    }
    const updatedEvents = pastEvents.filter((_, i) => i !== index);
    setPastEvents(updatedEvents);
    localStorage.setItem('pastEvents', JSON.stringify(updatedEvents));
    setSelectedEventIndices(prev => prev.filter(i => i !== index));
    alert('Survey deleted locally from this device.');
  };

  const deleteSelectedEvents = async () => {
    if (selectedEventIndices.length === 0) {
      alert('Please select past surveys to delete from Firebase.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete ${selectedEventIndices.length} selected surveys from Firebase?`)) {
      return;
    }
    const updatedEvents = pastEvents.filter((_, index) => !selectedEventIndices.includes(index));
    setPastEvents(updatedEvents);
    localStorage.setItem('pastEvents', JSON.stringify(updatedEvents));

    for (const index of selectedEventIndices) {
      const event = pastEvents[index];
      if (event.firebaseId) {
        try {
          await deleteDoc(doc(db, 'samplingEvents', event.firebaseId));
        } catch (error) {
          alert(`Error deleting survey ${event.location.lake} - ${event.location.date} from Firebase: ${error.message}`);
        }
      }
    }
    alert('Selected surveys deleted successfully from Firebase!');
    setSelectedEventIndices([]);
  };

  const handleEventChange = (field, value) => {
    if (isViewOnly) return;
    setEventData({ ...eventData, [field]: value });
  };

  const handleFishChange = (field, value) => {
    if (isViewOnly) return;
    setFishData({ ...fishData, [field]: value });
    
    // Reset custom diet content when not selecting "Other"
    if (field === 'stomach_content' && value !== 'Other') {
      setCustomDietContent('');
    }
  };

  const getGPSLocation = (setFormData, formType) => {
    if (isViewOnly) return;
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        // Convert lat/long to UTM (assuming Zone 12, adjust as needed)
        const utmCoords = fromLatLon(latitude, longitude, 12); // Replace 12 with your UTM zone
        if (formType === 'editNet') {
          setEditNetData({
            ...editNetData,
            latitude: utmCoords.easting.toFixed(2),
            longitude: utmCoords.northing.toFixed(2)
          });
        } else {
          setFormData({
            startUtmE: utmCoords.easting.toFixed(2),
            endUtmN: utmCoords.northing.toFixed(2)
          });
        }
        alert('GPS coordinates successfully fetched and converted to UTM.');
      },
      (error) => {
        alert('Error getting GPS location: ' + error.message);
      }
    );
  };

  // Ensure the app allows data entry on new surveys
  const handleEventSubmit = (e) => {
    e.preventDefault();
    if (!eventData.lake || !eventData.date || !eventData.observers || !eventData.gear) {
      alert('Please fill in all required fields: Lake, Date, Observers, and Gear.');
      return;
    }
    const newEvent = {
      location: { 
        lake: eventData.lake, 
        location: eventData.location, 
        date: eventData.date, 
        observers: eventData.observers, 
        gear: eventData.gear,
        field_notes: eventData.field_notes
      },
      environmental: {
        pH: Number(eventData.pH) || null,
        temp_water_c: Number(eventData.temp_water_c) || null,
        cond: Number(eventData.cond) || null,
        tdS: Number(eventData.tdS) || null,
        salts: Number(eventData.salts) || null,
        amps: Number(eventData.amps) || null
      },
      gear_type: eventData.gear,
      sets: [],
      season: new Date(eventData.date).getFullYear().toString(),
      is_finalized: false
    };
    setCurrentEvent(newEvent);
    localStorage.setItem('currentEvent', JSON.stringify(newEvent));
    setView('input'); // Ensure the view is set to input to show the dashboards
  };

  const addTransect = (e) => {
    e.preventDefault();
    if (isViewOnly) return;
    const effortTimeSec = Number(document.getElementById('effortTimeSec').value);
    const startUtmE = Number(document.getElementById('startUtmE').value);
    const endUtmN = Number(document.getElementById('endUtmN').value);
    if (!effortTimeSec || !startUtmE || !endUtmN) {
      alert('Please fill in all required fields: Effort Time (seconds), Start UTM_E, and End UTM_N.');
      return;
    }
    const newSet = {
      set_id: (currentEvent.sets.length + 1),
      type: 'transect',
      effort_time_sec: effortTimeSec,
      effort_time_hours: (effortTimeSec / 3600).toFixed(2),
      location: { start_utm_e: startUtmE, end_utm_n: endUtmN },
      fish: [],
      cpue: null
    };
    const updatedEvent = {
      ...currentEvent,
      sets: [...currentEvent.sets, newSet]
    };
    setCurrentEvent(updatedEvent);
    setSelectedTransect(newSet.set_id);
    localStorage.setItem('currentEvent', JSON.stringify(updatedEvent));
    document.getElementById('transectForm').reset();
  };

  const addNetSet = (e) => {
    e.preventDefault();
    if (isViewOnly) return;
    const setDatetime = document.getElementById('setDatetime').value;
    const startUtmE = Number(document.getElementById('startUtmENet').value);
    const endUtmN = Number(document.getElementById('endUtmNNet').value);
    if (!setDatetime || !startUtmE || !endUtmN) {
      alert('Please fill in all required fields: Set Date and Time, Start UTM_E, and End UTM_N.');
      return;
    }
    const newSet = {
      set_id: currentEvent.sets.length + 1,
      type: 'net_set',
      set_datetime: setDatetime,
      pull_datetime: null,
      soak_time_hours: null,
      location: { start_utm_e: startUtmE, end_utm_n: endUtmN },
      fish: [],
      cpue: null
    };
    const updatedEvent = {
      ...currentEvent,
      sets: [...currentEvent.sets, newSet]
    };
    setCurrentEvent(updatedEvent);
    setSelectedTransect(newSet.set_id);
    localStorage.setItem('currentEvent', JSON.stringify(updatedEvent));
    document.getElementById('netSetForm').reset();
  };

  const openEditNetModal = (setId) => {
    if (isViewOnly) return;
    const set = currentEvent.sets.find(s => s.set_id === setId);
    if (set) {
      setEditNetData({
        pull_datetime: set.pull_datetime || '',
        latitude: set.location.start_utm_e || '',
        longitude: set.location.end_utm_n || ''
      });
      setEditingSetId(setId);
      setShowEditNetModal(true);
    }
  };

  const handleEditNetSubmit = (e) => {
    e.preventDefault();
    if (isViewOnly) return;
    const pullDatetime = document.getElementById('editPullDatetime').value;
    const startUtmE = Number(document.getElementById('editStartUtmE').value);
    const endUtmN = Number(document.getElementById('editEndUtmN').value);
    if (!pullDatetime || !startUtmE || !endUtmN) {
      alert('Please fill in all required fields: Pull Date and Time, Start UTM_E, and End UTM_N.');
      return;
    }
    const updatedSets = currentEvent.sets.map(set => {
      if (set.set_id === editingSetId) {
        const newSet = {
          ...set,
          pull_datetime: pullDatetime,
          location: { start_utm_e: startUtmE, end_utm_n: endUtmN }
        };
        if (newSet.pull_datetime) {
          const soakTimeMs = new Date(newSet.pull_datetime) - new Date(newSet.set_datetime);
          newSet.soak_time_hours = (soakTimeMs / 3600000).toFixed(2);
          newSet.cpue = newSet.fish.reduce((sum, fish) => sum + (fish.count || 1), 0) / newSet.soak_time_hours;
        }
        return newSet;
      }
      return set;
    });
    const updatedEvent = { ...currentEvent, sets: updatedSets };
    setCurrentEvent(updatedEvent);
    localStorage.setItem('currentEvent', JSON.stringify(updatedEvent));
    setEditNetData({ pull_datetime: '', latitude: '', longitude: '' });
    setEditingSetId(null);
    setShowEditNetModal(false);
  };

  const addFish = (e) => {
    e.preventDefault();
    if (isViewOnly) return;
    if (!selectedTransect) {
      alert('Please select a transect or net set before adding fish.');
      return;
    }
    
    // Use custom diet content if "Other" is selected
    const stomachContent = fishData.stomach_content === 'Other' ? customDietContent : fishData.stomach_content;
    
    // Add custom diet content to the dropdown options if it's new
    if (fishData.stomach_content === 'Other' && customDietContent) {
      addCustomDietEntry(customDietContent);
    }
    
    const newFish = {
      spp: fishData.spp,
      length: Number(fishData.length) || null,
      weight: Number(fishData.weight) || null,
      stomach_content: stomachContent,
      sex: fishData.sex,
      fats: fishData.fats,
      notes: fishData.notes,
      count: Number(fishData.count) || 1
    };
    const updatedSets = currentEvent.sets.map(set => {
      if (set.set_id === selectedTransect) {
        const updatedSet = { ...set, fish: [...set.fish, newFish] };
        updatedSet.cpue = updatedSet.fish.reduce((sum, fish) => sum + (fish.count || 1), 0) / (updatedSet.effort_time_hours || updatedSet.soak_time_hours || 1);
        return updatedSet;
      }
      return set;
    });
    const updatedEvent = { ...currentEvent, sets: updatedSets };
    setCurrentEvent(updatedEvent);
    localStorage.setItem('currentEvent', JSON.stringify(updatedEvent));
    setFishData({ spp: '', length: '', weight: '', stomach_content: '', sex: '', fats: '', notes: '', count: 1 });
    setCustomDietContent('');
    setSelectedFishIndices([]);
  };

  const addCarpNoLength = () => {
    if (isViewOnly) return;
    if (!selectedTransect) {
      alert('Please select a transect or net set before adding fish.');
      return;
    }
    const newFish = {
      spp: 'Carp',
      length: null,
      weight: null,
      stomach_content: '',
      sex: '',
      fats: '',
      notes: '',
      count: 1
    };
    const updatedSets = currentEvent.sets.map(set => {
      if (set.set_id === selectedTransect) {
        const updatedSet = { ...set, fish: [...set.fish, newFish] };
        updatedSet.cpue = updatedSet.fish.reduce((sum, fish) => sum + (fish.count || 1), 0) / (updatedSet.effort_time_hours || updatedSet.soak_time_hours || 1);
        return updatedSet;
      }
      return set;
    });
    const updatedEvent = { ...currentEvent, sets: updatedSets };
    setCurrentEvent(updatedEvent);
    localStorage.setItem('currentEvent', JSON.stringify(updatedEvent));
  };

  const updateFish = (e) => {
    e.preventDefault();
    if (isViewOnly) return;
    if (!selectedTransect || editingFishIndex === null) {
      alert('Please select a fish entry to update.');
      return;
    }
    
    // Use custom diet content if "Other" is selected
    const stomachContent = fishData.stomach_content === 'Other' ? customDietContent : fishData.stomach_content;
    
    // Add custom diet content to the dropdown options if it's new
    if (fishData.stomach_content === 'Other' && customDietContent) {
      addCustomDietEntry(customDietContent);
    }
    
    const updatedFish = {
      spp: fishData.spp,
      length: Number(fishData.length) || null,
      weight: Number(fishData.weight) || null,
      stomach_content: stomachContent,
      sex: fishData.sex,
      fats: fishData.fats,
      notes: fishData.notes,
      count: Number(fishData.count) || 1
    };
    const updatedSets = currentEvent.sets.map(set => {
      if (set.set_id === selectedTransect) {
        const updatedFishArray = set.fish.map((fish, index) =>
          index === editingFishIndex ? updatedFish : fish
        );
        const updatedSet = { ...set, fish: updatedFishArray };
        updatedSet.cpue = updatedSet.fish.reduce((sum, fish) => sum + (fish.count || 1), 0) / (updatedSet.effort_time_hours || updatedSet.soak_time_hours || 1);
        return updatedSet;
      }
      return set;
    });
    const updatedEvent = { ...currentEvent, sets: updatedSets };
    setCurrentEvent(updatedEvent);
    localStorage.setItem('currentEvent', JSON.stringify(updatedEvent));
    setFishData({ spp: '', length: '', weight: '', stomach_content: '', sex: '', fats: '', notes: '', count: 1 });
    setCustomDietContent('');
    setEditingFishIndex(null);
    setSelectedFishIndices([]);
  };

  const deleteSelectedFish = () => {
    if (isViewOnly) return;
    if (!selectedTransect || selectedFishIndices.length === 0) {
      alert('Please select fish entries to delete.');
      return;
    }
    const updatedSets = currentEvent.sets.map(set => {
      if (set.set_id === selectedTransect) {
        const updatedFish = set.fish.filter((_, index) => !selectedFishIndices.includes(index));
        const updatedSet = { ...set, fish: updatedFish };
        updatedSet.cpue = updatedFish.reduce((sum, fish) => sum + (fish.count || 1), 0) / (updatedSet.effort_time_hours || updatedSet.soak_time_hours || 1);
        return updatedSet;
      }
      return set;
    });
    const updatedEvent = { ...currentEvent, sets: updatedSets };
    setCurrentEvent(updatedEvent);
    localStorage.setItem('currentEvent', JSON.stringify(updatedEvent));
    setSelectedFishIndices([]);
    setEditingFishIndex(null);
  };

  const saveEventToFirebase = async () => {
    if (isViewOnly) return;

    if (isOfflineMode) {
      alert('Offline mode enabled: Survey finalized and saved locally. It will sync when you go online.');
      // Save locally
      const updatedEvents = [...pastEvents, { ...currentEvent, is_finalized: true }];
      setPastEvents(updatedEvents);
      localStorage.setItem('pastEvents', JSON.stringify(updatedEvents));
    } else {
      try {
        // Upload to Firebase
        const docRef = await addDoc(collection(db, 'samplingEvents'), { ...currentEvent, is_finalized: true });
        console.log('Document written with ID: ', docRef.id);
        alert('Survey finalized and uploaded to Firebase successfully.');
      } catch (error) {
        console.error('Error uploading survey to Firebase: ', error);
        alert('Error uploading survey to Firebase: ' + error.message);
      }
    }

    resetApp();
  };

  const saveAsUnfinalized = () => {
    if (isViewOnly) return;
    const existingIndex = pastEvents.findIndex(event => event.location.lake === currentEvent.location.lake && event.location.date === currentEvent.location.date);
    let updatedEvents;
    if (existingIndex !== -1) {
      // Update the existing survey
      updatedEvents = pastEvents.map((event, index) =>
        index === existingIndex ? { ...currentEvent, is_finalized: false } : event
      );
    } else {
      // Add as a new survey if it doesn't exist
      updatedEvents = [...pastEvents, { ...currentEvent, is_finalized: false }];
    }
    setPastEvents(updatedEvents);
    localStorage.setItem('pastEvents', JSON.stringify(updatedEvents));
    resetApp();
  };

  const loadPastEvent = (event) => {
    setCurrentEvent(event);
    localStorage.setItem('currentEvent', JSON.stringify(event));
    setEventData({
      lake: event.location.lake || '',
      location: event.location.location || '',
      date: event.location.date || '',
      observers: event.location.observers || '',
      gear: event.location.gear || '',
      cond: event.environmental.cond || '',
      pH: event.environmental.pH || '',
      tdS: event.environmental.tdS || '',
      salts: event.environmental.salts || '',
      temp_water_c: event.environmental.temp_water_c || '',
      amps: event.environmental.amps || '',
      field_notes: event.location.field_notes || ''
    });
    setGearType(event.gear_type || '');
    setSelectedTransect(event.sets?.length > 0 ? event.sets[0].set_id : null);
    setIsViewOnly(false); // Allow full interaction regardless of finalized status
    setView('input');
  };

  const exportToExcel = () => {
    if (!currentEvent || !currentEvent.sets) return;

    const lakeName = currentEvent.location.lake?.replace(/\s+/g, '_') || 'UnknownLake';
    const eventDate = currentEvent.location.date?.replace(/-/g, '') || 'UnknownDate';
    const filename = `${lakeName}_${eventDate}.xlsx`;

    const headers = [
      'Lake', 'Observers', 'Month', 'Day', 'Year', 'Gear', 'Transect #',
      'Effort_time (sec)', 'Effort_time (min)', 'Effort_time (hr)', 'CPUE',
      'Start UTM_E', 'End UTM_N', 'Location', 'Cond', 'pH', 'tdS', 'Salts',
      'Temp_Water_C', 'AMPS'
    ];
    const fishHeader = ['SPP', 'Count', 'TL_mm', 'WT_g', 'Sex', 'Stomach Content', 'Notes'];

    const data = [];
    currentEvent.sets.forEach(set => {
      data.push(headers);
      const isElectrofishing = currentEvent.gear_type === 'electrofishing';
      const effortTimeSec = isElectrofishing ? set.effort_time_sec : 'N/A';
      const effortTimeMin = isElectrofishing && set.effort_time_sec ? (set.effort_time_sec / 60).toFixed(2) : 'N/A';
      const effortTimeHr = !isElectrofishing && set.soak_time_hours ? set.soak_time_hours : 'N/A';
      const transectData = [
        currentEvent.location.lake || 'N/A',
        currentEvent.location.observers || 'N/A',
        currentEvent.location.date ? new Date(currentEvent.location.date).getMonth() + 1 : 'N/A',
        currentEvent.location.date ? new Date(currentEvent.location.date).getDate() : 'N/A',
        currentEvent.location.date ? new Date(currentEvent.location.date).getFullYear() : 'N/A',
        currentEvent.location.gear || 'N/A',
        set.set_id || 'N/A',
        effortTimeSec,
        effortTimeMin,
        effortTimeHr,
        set.cpue || 'N/A',
        set.location?.start_utm_e || 'N/A',
        set.location?.end_utm_n || 'N/A',
        currentEvent.location.location || 'N/A',
        currentEvent.environmental.cond || 'N/A',
        currentEvent.environmental.pH || 'N/A',
        currentEvent.environmental.tdS || 'N/A',
        currentEvent.environmental.salts || 'N/A',
        currentEvent.environmental.temp_water_c || 'N/A',
        set.amps || currentEvent.environmental.amps || 'N/A'
      ];
      data.push(transectData);
      data.push(fishHeader);

      const fishData = (set.fish || []).map(fish => [
        fish.spp || 'N/A',
        fish.count || 1,
        fish.length || '',
        fish.weight || '',
        fish.sex || '',
        fish.stomach_content || '',
        fish.notes || ''
      ]);
      data.push(...fishData);
      data.push([]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, filename);
  };

  const abundanceCondition = () => {
    if (!currentEvent || !currentEvent.sets) return [];
    const speciesStats = {};
    currentEvent.sets.forEach(set => {
      set.fish.forEach(fish => {
        if (!fish.spp) return;
        if (!speciesStats[fish.spp]) speciesStats[fish.spp] = { count: 0, tl: [], wt: [], wr: [], kFactor: [] };
        speciesStats[fish.spp].count += fish.count || 1;
        if (fish.length) {
          for (let i = 0; i < (fish.count || 1); i++) {
            speciesStats[fish.spp].tl.push(fish.length);
          }
        }
        if (fish.weight && fish.length) {
          for (let i = 0; i < (fish.count || 1); i++) {
            speciesStats[fish.spp].wt.push(fish.weight);
            const speciesCoefficients = speciesData[fish.spp];
            
            // Check if species has Wr coefficients
            if (speciesCoefficients && speciesCoefficients.a && speciesCoefficients.b) {
              // Calculate Wr
              const logWs = speciesCoefficients.a + speciesCoefficients.b * Math.log10(fish.length);
              const Ws = Math.pow(10, logWs);
              const Wr = (fish.weight / Ws) * 100;
              speciesStats[fish.spp].wr.push(Wr);
            } else {
              // Calculate K-Factor: K = (W / L³) × 100000
              const kFactor = (fish.weight / Math.pow(fish.length, 3)) * 100000;
              speciesStats[fish.spp].kFactor.push(kFactor);
            }
          }
        }
      });
    });

    const totalEffortOrSoakHours = currentEvent.sets.reduce((sum, set) => sum + (Number(set.effort_time_hours || set.soak_time_hours) || 0), 0);

    return Object.keys(speciesStats).map(spp => {
      const count = speciesStats[spp].count;
      const tl = speciesStats[spp].tl;
      const wt = speciesStats[spp].wt;
      const wr = speciesStats[spp].wr;
      const kFactor = speciesStats[spp].kFactor;
      
      const meanTL = tl.length ? (tl.reduce((a, b) => a + b, 0) / tl.length).toFixed(1) : 0;
      const rangeTL = tl.length ? `${Math.min(...tl)}-${Math.max(...tl)}` : '-';
      const meanWT = wt.length ? (wt.reduce((a, b) => a + b, 0) / wt.length).toFixed(1) : 0;
      const rangeWT = wt.length ? `${Math.min(...wt)}-${Math.max(...wt)}` : '-';
      
      // Determine if K-Factor was used and calculate mean value
      const usedKFactor = kFactor.length > 0 && wr.length === 0;
      const meanWr = wr.length > 0 
        ? (wr.reduce((a, b) => a + b, 0) / wr.length).toFixed(1)
        : kFactor.length > 0 
          ? (kFactor.reduce((a, b) => a + b, 0) / kFactor.length).toFixed(1)
          : '-';
      
      const speciesCpue = totalEffortOrSoakHours > 0 ? (count / Number(totalEffortOrSoakHours)).toFixed(2) : 0;
      
      return { 
        species: spp, 
        count, 
        cpue: speciesCpue, 
        meanTL, 
        rangeTL, 
        meanWT, 
        rangeWT, 
        meanWr, 
        usedKFactor 
      };
    });
  };

  const anglerAbundance = () => {
    if (!currentEvent || !currentEvent.sets) return [];
    const speciesStats = {};
    currentEvent.sets.forEach(set => {
      set.fish.forEach(fish => {
        if (!fish.spp) return;
        if (!speciesStats[fish.spp]) speciesStats[fish.spp] = { count: 0, tl: [], wt: [] };
        speciesStats[fish.spp].count += fish.count || 1;
        if (fish.length) {
          for (let i = 0; i < (fish.count || 1); i++) {
            speciesStats[fish.spp].tl.push(fish.length / 25.4); // Convert mm to inches
          }
        }
        if (fish.weight) {
          for (let i = 0; i < (fish.count || 1); i++) {
            speciesStats[fish.spp].wt.push(fish.weight / 453.592); // Convert grams to pounds
          }
        }
      });
    });

    const totalEffortOrSoakHours = currentEvent.sets.reduce((sum, set) => sum + (Number(set.effort_time_hours || set.soak_time_hours) || 0), 0);

    return Object.keys(speciesStats).map(spp => {
      const count = speciesStats[spp].count;
      const tl = speciesStats[spp].tl;
      const wt = speciesStats[spp].wt;
      const speciesCpue = totalEffortOrSoakHours > 0 ? (count / Number(totalEffortOrSoakHours)).toFixed(2) : 0;
      const tlRange = tl.length ? `${Math.min(...tl).toFixed(1)}-${Math.max(...tl).toFixed(1)}` : '-';
      const avgTL = tl.length ? (tl.reduce((a, b) => a + b, 0) / tl.length).toFixed(1) : 0;
      const wtRange = wt.length ? `${Math.min(...wt).toFixed(2)}-${Math.max(...wt).toFixed(2)}` : '-';
      const avgWT = wt.length ? (wt.reduce((a, b) => a + b, 0) / wt.length).toFixed(2) : 0;
      return { species: spp, count, cpue: speciesCpue, tlRange, avgTL, wtRange, avgWT };
    });
  };

  const getFishCountNote = () => {
    if (!currentEvent || !currentEvent.sets) return '';
    let totalFish = 0;
    let measuredFish = 0;
    currentEvent.sets.forEach(set => {
      set.fish.forEach(fish => {
        totalFish += fish.count || 1;
        if (fish.length || fish.weight) measuredFish += fish.count || 1;
      });
    });
    if (totalFish === measuredFish) return '';
    return `Note: Only ${measuredFish} individuals were measured and weighed; total count is ${totalFish}.`;
  };

  const histogramData = () => {
    if (!currentEvent || !currentEvent.sets || !selectedSpecies) return null;

    const lengths = currentEvent.sets
      .flatMap(set => set.fish || [])
      .filter(fish => fish.spp === selectedSpecies && fish.length !== null && !isNaN(fish.length))
      .flatMap(fish => Array(fish.count || 1).fill(fish.length / 25.4));

    if (lengths.length === 0) return null;

    const minLength = Math.max(Math.floor(Math.min(...lengths)) - 1, 0);
    const maxLength = Math.min(Math.ceil(Math.max(...lengths)) + 1, 100);
    const bins = Array.from({ length: maxLength - minLength + 1 }, (_, i) => minLength + i);

    const histogramData = Array(bins.length - 1).fill(0);
    lengths.forEach(length => {
      const binIndex = Math.min(Math.floor(length - minLength), bins.length - 2);
      if (binIndex >= 0) histogramData[binIndex]++;
    });

    const speciesMetrics = speciesData[selectedSpecies];
    if (!speciesMetrics) return null;

    const maxY = Math.max(...histogramData) * 1.05 || 10;

    return {
      labels: bins.slice(0, -1).map((bin, index) => `${bin.toFixed(1)}-${bins[index + 1].toFixed(1)}`),
      datasets: [{
        label: 'Length Frequency',
        data: histogramData,
        backgroundColor: 'rgba(0, 128, 128, 0.6)',
        borderColor: 'rgba(0, 128, 128, 1)',
        borderWidth: 1,
      }],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'category',
            title: { display: true, text: 'Total Length (inches)' },
            ticks: { stepSize: 1 }
          },
          y: {
            type: 'linear',
            title: { display: true, text: 'Number of Fish' },
            beginAtZero: true,
            max: maxY
          }
        },
        plugins: {
          title: { display: true, text: `${speciesData[selectedSpecies].name} Length Frequency Distribution`, padding: 15, color: '#008080' },
          annotation: {
            annotations: [
              {
                type: 'label',
                xValue: 0,
                yValue: maxY * 0.95,
                content: `n=${lengths.length}`,
                font: { weight: 'bold', size: 12 },
                color: '#008080',
                position: 'start'
              }
            ]
          }
        }
      }
    };
  };

  const speciesOptions = [...new Set(currentEvent && currentEvent.sets ? currentEvent.sets.flatMap(set => set.fish.map(fish => fish.spp)).filter(Boolean) : [])];

  // Add console log to verify speciesOptions
  console.log('Species Options:', speciesOptions);

  const resetApp = () => {
    setView('input');
    setCurrentEvent(null);
    setEventData({
      lake: '', location: '', date: '', observers: '', gear: '',
      cond: '', pH: '', tdS: '', salts: '', temp_water_c: '', amps: '', field_notes: ''
    });
    setFishData({ spp: '', length: '', weight: '', stomach_content: '', sex: '', fats: '', notes: '', count: 1 });
    setGearType('');
    setSelectedTransect(null);
    setSelectedSpecies('');
    setSelectedFishIndices([]);
    setSelectedEventIndices([]);
    setEditingFishIndex(null);
    setIsViewOnly(false);
    localStorage.removeItem('currentEvent');
  };

  const renderHomePage = () => (
    <div className="welcome">
      <h1>Welcome to NERO Sportfish Data</h1>
      <div className="welcome-buttons">
        <button onClick={() => setView('input')}>New Survey</button>
        <button onClick={() => setView('past')}>View Past Surveys</button>
      </div>
    </div>
  );

  const renderEnvironmentalDashboard = () => (
    <div className="form-container">
      <div className="section site-info">
        <h4>Site Information</h4>
        <div className="form-group">
          <label>Lake</label>
          <input value={eventData.lake} onChange={(e) => handleEventChange('lake', e.target.value)} required disabled={isViewOnly} />
        </div>
        <div className="form-group">
          <label>Location</label>
          <input value={eventData.location} onChange={(e) => handleEventChange('location', e.target.value)} disabled={isViewOnly} />
        </div>
        <div className="form-group">
          <label>Date</label>
          <input type="date" value={eventData.date} onChange={(e) => handleEventChange('date', e.target.value)} required disabled={isViewOnly} />
        </div>
        <div className="form-group">
          <label>Observers</label>
          <input value={eventData.observers} onChange={(e) => handleEventChange('observers', e.target.value)} required disabled={isViewOnly} />
        </div>
        <div className="form-group">
          <label>Gear</label>
          <select value={eventData.gear} onChange={(e) => { handleEventChange('gear', e.target.value); setGearType(e.target.value); }} required disabled={isViewOnly}>
            <option value="">Select Gear</option>
            <option value="electrofishing">Electrofishing</option>
            <option value="gillnet">Gillnet</option>
            <option value="fyke_net">Fyke Net</option>
          </select>
        </div>
        <div className="form-group">
          <label>Field Notes (Optional)</label>
          <textarea
            value={eventData.field_notes}
            onChange={(e) => handleEventChange('field_notes', e.target.value)}
            placeholder="General observations (e.g., weather, site conditions)"
            rows="4"
            disabled={isViewOnly}
          />
        </div>
      </div>
      <div className="section environmental-data">
        <h4>Environmental Data</h4>
        <div className="form-group">
          <label>pH</label>
          <input type="number" step="0.1" value={eventData.pH} onChange={(e) => handleEventChange('pH', e.target.value)} placeholder="e.g., 7.5" disabled={isViewOnly} />
        </div>
        <div className="form-group">
          <label>Temp (°C)</label>
          <input type="number" step="0.1" value={eventData.temp_water_c} onChange={(e) => handleEventChange('temp_water_c', e.target.value)} placeholder="e.g., 20.0" disabled={isViewOnly} />
        </div>
        <div className="form-group">
          <label>Cond</label>
          <input type="number" value={eventData.cond} onChange={(e) => handleEventChange('cond', e.target.value)} placeholder="e.g., 500" disabled={isViewOnly} />
        </div>
        <div className="form-group">
          <label>tdS</label>
          <input type="number" value={eventData.tdS} onChange={(e) => handleEventChange('tdS', e.target.value)} placeholder="e.g., 300" disabled={isViewOnly} />
        </div>
        <div className="form-group">
          <label>Salts</label>
          <input type="number" step="0.1" value={eventData.salts} onChange={(e) => handleEventChange('salts', e.target.value)} placeholder="e.g., 0.5" disabled={isViewOnly} />
        </div>
        <div className="form-group">
          <label>AMPS</label>
          <input type="number" step="0.1" value={eventData.amps} onChange={(e) => handleEventChange('amps', e.target.value)} placeholder="e.g., 10.0" disabled={isViewOnly} />
        </div>
      </div>
      <div className="button-group">
        <button onClick={handleEventSubmit} disabled={isViewOnly}>Save Environmental Data</button>
        <button type="button" onClick={() => setShowModal(null)}>Close</button>
      </div>
    </div>
  );

  const renderTransectDashboard = () => {
    const waypoints = currentEvent?.sets.map(set => {
      const { latitude, longitude } = set.location;
      if (latitude == null || longitude == null) {
        console.error('Invalid coordinates:', latitude, longitude);
        return null; // Skip invalid waypoints
      }
      const start = [latitude, longitude];
      const end = [latitude + 0.001, longitude + 0.001]; // Example offset for end point
      return {
        set_id: set.set_id,
        type: set.type,
        start,
        end
      };
    }).filter(Boolean); // Remove null entries

    const mapCenter = waypoints.length > 0 ? waypoints[0].start : [39.0, -110.0]; // Default center

    return (
      <div>
        {currentEvent.sets.length === 0 ? (
          <p>No transects or net sets added yet.</p>
        ) : (
          <ul>
            {currentEvent.sets.map((set) => (
              <li key={set.set_id}>
                {set.type === 'transect' ? `Transect #${set.set_id}` : `Net #${set.set_id}`}
                {set.type === 'net_set' && !set.pull_datetime && <span className="pending-label"> (Pending)</span>}
                - CPUE: {set.cpue || 'N/A'}
                {set.type === 'net_set' && (
                  <button onClick={() => openEditNetModal(set.set_id)} disabled={isViewOnly}>Edit Pull Date/Location</button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="button-group">
          <button onClick={addTransect} disabled={gearType !== 'electrofishing' || isViewOnly}>Add Transect</button>
          <button onClick={addNetSet} disabled={(gearType !== 'gillnet' && gearType !== 'fyke_net') || isViewOnly}>Add Net Set</button>
          <button onClick={() => setIsMapVisible(!isMapVisible)}>
            {isMapVisible ? 'Hide Map' : 'Show Map'}
          </button>
        </div>
        {isMapVisible && waypoints.length > 0 && (
          <div className="map-container">
            <MapContainer center={mapCenter} zoom={10} style={{ height: '300px', width: '100%' }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {waypoints.map(waypoint => (
                <div key={waypoint.set_id}>
                  <Marker position={waypoint.start} />
                  <Marker position={waypoint.end} />
                  <Polyline positions={[waypoint.start, waypoint.end]} color={waypoint.type === 'transect' ? 'blue' : 'red'} />
                </div>
              ))}
            </MapContainer>
          </div>
        )}
        <form id="transectForm" style={{ display: gearType === 'electrofishing' ? 'block' : 'none' }}>
          <input type="number" id="effortTimeSec" placeholder="Effort Time (seconds)" required disabled={isViewOnly} />
          <input type="number" id="startUtmE" placeholder="Start UTM_E" required disabled={isViewOnly} />
          <input type="number" id="endUtmN" placeholder="End UTM_N" required disabled={isViewOnly} />
          <button type="button" onClick={() => getGPSLocation((data) => {
            document.getElementById('startUtmE').value = data.startUtmE;
            document.getElementById('endUtmN').value = data.endUtmN;
          }, 'transect')} className="gps-button" disabled={isViewOnly}>Get GPS</button>
          <button type="submit" onClick={addTransect} disabled={isViewOnly}>Add Transect</button>
        </form>
        <form id="netSetForm" style={{ display: (gearType === 'gillnet' || gearType === 'fyke_net') ? 'block' : 'none' }}>
          <input type="datetime-local" id="setDatetime" placeholder="Set Date and Time" required disabled={isViewOnly} />
          <input type="number" id="startUtmENet" placeholder="Start UTM_E" required disabled={isViewOnly} />
          <input type="number" id="endUtmNNet" placeholder="End UTM_N" required disabled={isViewOnly} />
          <button type="button" onClick={() => getGPSLocation((data) => {
            document.getElementById('startUtmENet').value = data.startUtmE;
            document.getElementById('endUtmNNet').value = data.endUtmN;
          }, 'net')} className="gps-button" disabled={isViewOnly}>Get GPS</button>
          <button type="submit" onClick={addNetSet} disabled={isViewOnly}>Add Net Set</button>
        </form>
        <div className="button-group">
          <button type="button" onClick={() => setShowModal(null)}>Close</button>
        </div>
        {showEditNetModal && (
          <div className="modal">
            <div className="modal-content">
              <h2>Edit Net Pull Date/Location</h2>
              <form id="editNetForm" onSubmit={handleEditNetSubmit}>
                <div className="form-group">
                  <label>Pull Date and Time</label>
                  <input type="datetime-local" id="editPullDatetime" value={editNetData.pull_datetime} onChange={(e) => setEditNetData({ ...editNetData, pull_datetime: e.target.value })} required disabled={isViewOnly} />
                </div>
                <div className="form-group">
                  <label>Start UTM_E</label>
                  <input type="number" id="editStartUtmE" value={editNetData.latitude} onChange={(e) => setEditNetData({ ...editNetData, latitude: e.target.value })} required disabled={isViewOnly} />
                </div>
                <div className="form-group">
                  <label>End UTM_N</label>
                  <input type="number" id="editEndUtmN" value={editNetData.longitude} onChange={(e) => setEditNetData({ ...editNetData, longitude: e.target.value })} required disabled={isViewOnly} />
                </div>
                <button type="button" onClick={() => getGPSLocation(null, 'editNet')} className="gps-button" disabled={isViewOnly}>Get GPS</button>
                <div className="button-group">
                  <button type="submit" disabled={isViewOnly}>Save Changes</button>
                  <button type="button" onClick={() => setShowEditNetModal(false)} disabled={isViewOnly}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderFishDashboard = () => (
    <div>
      <form onSubmit={editingFishIndex === null ? addFish : updateFish}>
        <div className="form-group">
          <label>Net Set/Transect</label>
          <select
            value={selectedTransect || ''}
            onChange={(e) => setSelectedTransect(Number(e.target.value))}
            required
            disabled={isViewOnly}
          >
            <option value="">Select a Transect/Net Set</option>
            {currentEvent.sets.map(set => (
              <option key={set.set_id} value={set.set_id}>
                {set.type === 'transect' ? `Transect #${set.set_id}` : `Net #${set.set_id}`}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Species</label>
          <select
            value={fishData.spp}
            onChange={(e) => handleFishChange('spp', e.target.value)}
            required
            disabled={isViewOnly}
          >
            <option value="">Select Species</option>
            {Object.keys(speciesData).map(spp => (
              <option key={spp} value={spp}>{speciesData[spp].name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Count</label>
          <input
            type="number"
            min="1"
            value={fishData.count}
            onChange={(e) => handleFishChange('count', e.target.value)}
            disabled={isViewOnly}
          />
        </div>
        <div className="form-group">
          <label>Length (mm)</label>
          <input type="number" value={fishData.length} onChange={(e) => handleFishChange('length', e.target.value)} disabled={isViewOnly} />
        </div>
        <div className="form-group">
          <label>Weight (g)</label>
          <input type="number" value={fishData.weight} onChange={(e) => handleFishChange('weight', e.target.value)} disabled={isViewOnly} />
        </div>
        <div className="form-group">
          <label>Diet Content</label>
          <select
            value={fishData.stomach_content}
            onChange={(e) => handleFishChange('stomach_content', e.target.value)}
            required
            disabled={isViewOnly}
          >
            <option value="">Select Diet Content</option>
            {getAllDietOptions().map(content => (
              <option key={content} value={content}>{content}</option>
            ))}
          </select>
        </div>
        {fishData.stomach_content === 'Other' && (
          <div className="form-group">
            <label>Custom Diet Content</label>
            <input
              type="text"
              value={customDietContent}
              onChange={(e) => setCustomDietContent(e.target.value)}
              placeholder="Enter custom diet content"
              required
              disabled={isViewOnly}
            />
          </div>
        )}
        <div className="form-group">
          <label>Sex</label>
          <input value={fishData.sex} onChange={(e) => handleFishChange('sex', e.target.value)} disabled={isViewOnly} />
        </div>
        <div className="form-group">
          <label>Fats</label>
          <input value={fishData.fats} onChange={(e) => handleFishChange('fats', e.target.value)} disabled={isViewOnly} />
        </div>
        <div className="form-group">
          <label>Notes</label>
          <input value={fishData.notes} onChange={(e) => handleFishChange('notes', e.target.value)} disabled={isViewOnly} />
        </div>
        <div className="button-group">
          <button type="submit" disabled={isViewOnly}>{editingFishIndex === null ? 'Add Fish' : 'Update Fish'}</button>
          <button type="button" onClick={addCarpNoLength} disabled={isViewOnly}>Add Carp (No Length)</button>
          {editingFishIndex !== null && (
            <button
              type="button"
              onClick={() => {
                setFishData({ spp: '', length: '', weight: '', stomach_content: '', sex: '', fats: '', notes: '', count: 1 });
                setCustomDietContent('');
                setEditingFishIndex(null);
              }}
              disabled={isViewOnly}
            >
              Cancel Edit
            </button>
          )}
        </div>
      </form>
      {selectedTransect && currentEvent.sets.length > 0 && (
        <div className="fish-entries-table">
          <h4>Fish Entries</h4>
          {currentEvent.sets.find(set => set.set_id === selectedTransect)?.fish.length > 0 ? (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Net Set #</th>
                    <th>Species</th>
                    <th>Count</th>
                    <th>Length (mm)</th>
                    <th>Weight (g)</th>
                    <th>Sex</th>
                    <th>Stomach Content</th>
                    <th>Fats</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {currentEvent.sets
                    .find(set => set.set_id === selectedTransect)
                    ?.fish.map((fish, index) => (
                      <tr key={index}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedFishIndices.includes(index)}
                            onChange={() => {
                              if (isViewOnly) return;
                              setSelectedFishIndices(prev =>
                                prev.includes(index)
                                  ? prev.filter(i => i !== index)
                                  : [...prev, index]
                              );
                            }}
                          />
                        </td>
                        <td
                          onClick={() => {
                            if (isViewOnly || !selectedFishIndices.includes(index)) return;
                            setEditingFishIndex(index);
                            const fish = currentEvent.sets.find(set => set.set_id === selectedTransect)?.fish[index];
                            
                            // Check if the stomach content is a custom entry (not in predefined options)
                            const isCustomContent = fish.stomach_content && !getAllDietOptions().includes(fish.stomach_content);
                            
                            setFishData({
                              spp: fish.spp || '',
                              length: fish.length || '',
                              weight: fish.weight || '',
                              stomach_content: isCustomContent ? 'Other' : (fish.stomach_content || ''),
                              sex: fish.sex || '',
                              fats: fish.fats || '',
                              notes: fish.notes || '',
                              count: fish.count || 1
                            });
                            
                            // Set custom diet content if it's a custom entry
                            if (isCustomContent) {
                              setCustomDietContent(fish.stomach_content);
                            } else {
                              setCustomDietContent('');
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) && !isViewOnly ? 'pointer' : 'default' }}
                        >
                          {selectedTransect}
                        </td>
                        <td
                          onClick={() => {
                            if (isViewOnly || !selectedFishIndices.includes(index)) return;
                            setEditingFishIndex(index);
                            const fish = currentEvent.sets.find(set => set.set_id === selectedTransect)?.fish[index];
                            
                            // Check if the stomach content is a custom entry (not in predefined options)
                            const isCustomContent = fish.stomach_content && !getAllDietOptions().includes(fish.stomach_content);
                            
                            setFishData({
                              spp: fish.spp || '',
                              length: fish.length || '',
                              weight: fish.weight || '',
                              stomach_content: isCustomContent ? 'Other' : (fish.stomach_content || ''),
                              sex: fish.sex || '',
                              fats: fish.fats || '',
                              notes: fish.notes || '',
                              count: fish.count || 1
                            });
                            
                            // Set custom diet content if it's a custom entry
                            if (isCustomContent) {
                              setCustomDietContent(fish.stomach_content);
                            } else {
                              setCustomDietContent('');
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) && !isViewOnly ? 'pointer' : 'default' }}
                        >
                          {speciesData[fish.spp]?.name || fish.spp}
                        </td>
                        <td
                          onClick={() => {
                            if (isViewOnly || !selectedFishIndices.includes(index)) return;
                            setEditingFishIndex(index);
                            const fish = currentEvent.sets.find(set => set.set_id === selectedTransect)?.fish[index];
                            
                            // Check if the stomach content is a custom entry (not in predefined options)
                            const isCustomContent = fish.stomach_content && !getAllDietOptions().includes(fish.stomach_content);
                            
                            setFishData({
                              spp: fish.spp || '',
                              length: fish.length || '',
                              weight: fish.weight || '',
                              stomach_content: isCustomContent ? 'Other' : (fish.stomach_content || ''),
                              sex: fish.sex || '',
                              fats: fish.fats || '',
                              notes: fish.notes || '',
                              count: fish.count || 1
                            });
                            
                            // Set custom diet content if it's a custom entry
                            if (isCustomContent) {
                              setCustomDietContent(fish.stomach_content);
                            } else {
                              setCustomDietContent('');
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) && !isViewOnly ? 'pointer' : 'default' }}
                        >
                          {fish.count || 1}
                        </td>
                        <td
                          onClick={() => {
                            if (isViewOnly || !selectedFishIndices.includes(index)) return;
                            setEditingFishIndex(index);
                            const fish = currentEvent.sets.find(set => set.set_id === selectedTransect)?.fish[index];
                            
                            // Check if the stomach content is a custom entry (not in predefined options)
                            const isCustomContent = fish.stomach_content && !getAllDietOptions().includes(fish.stomach_content);
                            
                            setFishData({
                              spp: fish.spp || '',
                              length: fish.length || '',
                              weight: fish.weight || '',
                              stomach_content: isCustomContent ? 'Other' : (fish.stomach_content || ''),
                              sex: fish.sex || '',
                              fats: fish.fats || '',
                              notes: fish.notes || '',
                              count: fish.count || 1
                            });
                            
                            // Set custom diet content if it's a custom entry
                            if (isCustomContent) {
                              setCustomDietContent(fish.stomach_content);
                            } else {
                              setCustomDietContent('');
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) && !isViewOnly ? 'pointer' : 'default' }}
                        >
                          {fish.length || '-'}
                        </td>
                        <td
                          onClick={() => {
                            if (isViewOnly || !selectedFishIndices.includes(index)) return;
                            setEditingFishIndex(index);
                            const fish = currentEvent.sets.find(set => set.set_id === selectedTransect)?.fish[index];
                            
                            // Check if the stomach content is a custom entry (not in predefined options)
                            const isCustomContent = fish.stomach_content && !getAllDietOptions().includes(fish.stomach_content);
                            
                            setFishData({
                              spp: fish.spp || '',
                              length: fish.length || '',
                              weight: fish.weight || '',
                              stomach_content: isCustomContent ? 'Other' : (fish.stomach_content || ''),
                              sex: fish.sex || '',
                              fats: fish.fats || '',
                              notes: fish.notes || '',
                              count: fish.count || 1
                            });
                            
                            // Set custom diet content if it's a custom entry
                            if (isCustomContent) {
                              setCustomDietContent(fish.stomach_content);
                            } else {
                              setCustomDietContent('');
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) && !isViewOnly ? 'pointer' : 'default' }}
                        >
                          {fish.weight || '-'}
                        </td>
                        <td
                          onClick={() => {
                            if (isViewOnly || !selectedFishIndices.includes(index)) return;
                            setEditingFishIndex(index);
                            const fish = currentEvent.sets.find(set => set.set_id === selectedTransect)?.fish[index];
                            
                            // Check if the stomach content is a custom entry (not in predefined options)
                            const isCustomContent = fish.stomach_content && !getAllDietOptions().includes(fish.stomach_content);
                            
                            setFishData({
                              spp: fish.spp || '',
                              length: fish.length || '',
                              weight: fish.weight || '',
                              stomach_content: isCustomContent ? 'Other' : (fish.stomach_content || ''),
                              sex: fish.sex || '',
                              fats: fish.fats || '',
                              notes: fish.notes || '',
                              count: fish.count || 1
                            });
                            
                            // Set custom diet content if it's a custom entry
                            if (isCustomContent) {
                              setCustomDietContent(fish.stomach_content);
                            } else {
                              setCustomDietContent('');
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) && !isViewOnly ? 'pointer' : 'default' }}
                        >
                          {fish.sex || '-'}
                        </td>
                        <td
                          onClick={() => {
                            if (isViewOnly || !selectedFishIndices.includes(index)) return;
                            setEditingFishIndex(index);
                            const fish = currentEvent.sets.find(set => set.set_id === selectedTransect)?.fish[index];
                            
                            // Check if the stomach content is a custom entry (not in predefined options)
                            const isCustomContent = fish.stomach_content && !getAllDietOptions().includes(fish.stomach_content);
                            
                            setFishData({
                              spp: fish.spp || '',
                              length: fish.length || '',
                              weight: fish.weight || '',
                              stomach_content: isCustomContent ? 'Other' : (fish.stomach_content || ''),
                              sex: fish.sex || '',
                              fats: fish.fats || '',
                              notes: fish.notes || '',
                              count: fish.count || 1
                            });
                            
                            // Set custom diet content if it's a custom entry
                            if (isCustomContent) {
                              setCustomDietContent(fish.stomach_content);
                            } else {
                              setCustomDietContent('');
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) && !isViewOnly ? 'pointer' : 'default' }}
                        >
                          {fish.stomach_content || '-'}
                        </td>
                        <td
                          onClick={() => {
                            if (isViewOnly || !selectedFishIndices.includes(index)) return;
                            setEditingFishIndex(index);
                            const fish = currentEvent.sets.find(set => set.set_id === selectedTransect)?.fish[index];
                            
                            // Check if the stomach content is a custom entry (not in predefined options)
                            const isCustomContent = fish.stomach_content && !getAllDietOptions().includes(fish.stomach_content);
                            
                            setFishData({
                              spp: fish.spp || '',
                              length: fish.length || '',
                              weight: fish.weight || '',
                              stomach_content: isCustomContent ? 'Other' : (fish.stomach_content || ''),
                              sex: fish.sex || '',
                              fats: fish.fats || '',
                              notes: fish.notes || '',
                              count: fish.count || 1
                            });
                            
                            // Set custom diet content if it's a custom entry
                            if (isCustomContent) {
                              setCustomDietContent(fish.stomach_content);
                            } else {
                              setCustomDietContent('');
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) && !isViewOnly ? 'pointer' : 'default' }}
                        >
                          {fish.fats || '-'}
                        </td>
                        <td
                          onClick={() => {
                            if (isViewOnly || !selectedFishIndices.includes(index)) return;
                            setEditingFishIndex(index);
                            const fish = currentEvent.sets.find(set => set.set_id === selectedTransect)?.fish[index];
                            
                            // Check if the stomach content is a custom entry (not in predefined options)
                            const isCustomContent = fish.stomach_content && !getAllDietOptions().includes(fish.stomach_content);
                            
                            setFishData({
                              spp: fish.spp || '',
                              length: fish.length || '',
                              weight: fish.weight || '',
                              stomach_content: isCustomContent ? 'Other' : (fish.stomach_content || ''),
                              sex: fish.sex || '',
                              fats: fish.fats || '',
                              notes: fish.notes || '',
                              count: fish.count || 1
                            });
                            
                            // Set custom diet content if it's a custom entry
                            if (isCustomContent) {
                              setCustomDietContent(fish.stomach_content);
                            } else {
                              setCustomDietContent('');
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) && !isViewOnly ? 'pointer' : 'default' }}
                        >
                          {fish.notes || '-'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <div className="button-group">
                <button onClick={deleteSelectedFish} disabled={isViewOnly}>Delete Selected</button>
              </div>
            </>
          ) : (
            <p>No fish entries for this transect/net set.</p>
          )}
        </div>
      )}
      <div className="button-group">
        <button type="button" onClick={() => setShowModal(null)}>Close</button>
      </div>
    </div>
  );

  const renderInputPage = () => (
    <div className="input-page">
      {currentEvent && (
        <h2 className="lake-title">{currentEvent.location.lake} Survey - Input</h2>
      )}
      {!currentEvent && (
        <h2>New Survey Input</h2>
      )}
      <div className="dashboard-container">
        <div className="dashboard dashboard-compact" onClick={() => setShowModal('environmental')}>
          <h3>Environmental Data</h3>
          <p>Click to enter site information and environmental data (e.g., Lake, pH, Temp).</p>
        </div>
        {currentEvent && permissions.canEdit && (
          <>
            <div className="dashboard dashboard-compact" onClick={() => setShowModal('transect')}>
              <h3>Transect/Net Set Data</h3>
              <p>Click to add or view transects/net sets (e.g., Effort Time, UTM coordinates).</p>
            </div>
            <div className="dashboard dashboard-compact" onClick={() => setShowModal('fish')}>
              <h3>Fish Data</h3>
              <p>Click to enter fish data (e.g., Species, Length, Weight).</p>
            </div>
          </>
        )}
      </div>
      <div className="button-group">
        {currentEvent && (
          <>
            <button onClick={() => setView('results')}>View Survey Results</button>
            {permissions.canEdit && <button onClick={exportToExcel}>Download Dataset</button>}
            {permissions.canEdit && <button onClick={saveEventToFirebase} disabled={isViewOnly}>Finalize Survey</button>}
            {permissions.canEdit && <button onClick={saveAsUnfinalized} disabled={isViewOnly}>Save as Unfinalized</button>}
          </>
        )}
        <button onClick={() => setView('past')}>Past Surveys</button>
      </div>
      {showModal === 'environmental' && (
        <div className="modal">
          <div className="modal-content">
            <h2>Environmental Data</h2>
            {renderEnvironmentalDashboard()}
          </div>
        </div>
      )}
      {showModal === 'transect' && permissions.canEdit && (
        <div className="modal">
          <div className="modal-content">
            <h2>Transect/Net Set Data</h2>
            {renderTransectDashboard()}
          </div>
        </div>
      )}
      {showModal === 'fish' && permissions.canEdit && (
        <div className="modal">
          <div className="modal-content">
            <h2>Fish Data</h2>
            {renderFishDashboard()}
          </div>
        </div>
      )}
    </div>
  );

  const getDietData = () => {
    if (!currentEvent || !currentEvent.sets) return { labels: [], datasets: [] };

    const dietCounts = {};
    currentEvent.sets.forEach(set => {
      set.fish.forEach(fish => {
        const content = fish.stomach_content || 'Unknown';
        dietCounts[content] = (dietCounts[content] || 0) + (fish.count || 1);
      });
    });

    const labels = Object.keys(dietCounts);
    const data = Object.values(dietCounts);

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor: labels.map((_, index) => `hsl(${index * 360 / labels.length}, 70%, 50%)`),
          hoverBackgroundColor: labels.map((_, index) => `hsl(${index * 360 / labels.length}, 70%, 60%)`)
        }
      ]
    };
  };

  const getDietDataBySpecies = (species) => {
    if (!currentEvent || !currentEvent.sets || !species) return { labels: [], datasets: [] };

    const dietCounts = {};
    currentEvent.sets.forEach(set => {
      set.fish.forEach(fish => {
        if (fish.spp === species) {
          const content = fish.stomach_content.trim() || 'Unknown';
          dietCounts[content] = (dietCounts[content] || 0) + (fish.count || 1);
        }
      });
    });

    const labels = Object.keys(dietCounts);
    const data = Object.values(dietCounts);

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor: labels.map((_, index) => `hsl(${index * 360 / labels.length}, 70%, 50%)`),
          hoverBackgroundColor: labels.map((_, index) => `hsl(${index * 360 / labels.length}, 70%, 60%)`)
        }
      ]
    };
  };

  const renderResultsPage = () => {
    const waypoints = getFilteredWaypoints(selectedSpeciesForMap);
    const mapCenter = waypoints.length > 0 ? waypoints[0].start : [39.0, -110.0];
    const speciesOptionsForDiet = [...new Set(currentEvent && currentEvent.sets ? currentEvent.sets.flatMap(set => set.fish.map(fish => fish.spp)).filter(Boolean) : [])];
    const pieData = getDietDataBySpecies(selectedSpeciesForDiet);

    return (
      <div className="results-page">
        {currentEvent && (
          <h2 className="lake-title">{currentEvent.location.lake} Survey - Results</h2>
        )}
        {!currentEvent && (
          <h2>NERO Sportfish Data - Survey Results</h2>
        )}
        <div className="dashboard-container">
          <div className="dashboard dashboard-compact" onClick={() => setResultsModal('lengthFrequency')}>
            <h3>Length Frequency Distribution</h3>
            <p>Click to view Length Frequency by Species</p>
          </div>
          <div className="dashboard dashboard-compact" onClick={() => setResultsModal('abundanceCondition')}>
            <h3>Survey Statistics and Location</h3>
            <p>Click to view abundance, condition metrics, and location map</p>
          </div>
          <div className="dashboard dashboard-compact" onClick={() => setResultsModal('anglerAbundance')}>
            <h3>Angler Report</h3>
            <p>Click to view angler-focused metrics (CPUE, TL in inches, WT in pounds).</p>
          </div>
          <div className="dashboard dashboard-compact">
            <h3>Survey Metrics</h3>
            <p>Total Fish: {currentEvent?.sets.reduce((sum, set) => sum + set.fish.reduce((s, fish) => s + (fish.count || 1), 0), 0) || 0}</p>
            <p>Total Effort: {(currentEvent?.sets.reduce((sum, set) => sum + (Number(set.effort_time_hours || set.soak_time_hours) || 0), 0)).toFixed(2) || '0.00'} hours</p>
            <p>Survey CPUE: {(currentEvent?.sets.reduce((sum, set) => sum + set.fish.reduce((s, fish) => s + (fish.count || 1), 0), 0) / currentEvent?.sets.reduce((sum, set) => sum + (Number(set.effort_time_hours || set.soak_time_hours) || 0), 0)).toFixed(2) || 'N/A'}</p>
            <p>{getFishCountNote()}</p>
          </div>
        </div>
        <div className="button-group">
          <button onClick={() => setView('input')}>Back to Input</button>
          {permissions.canEdit && <button onClick={exportToExcel}>Download Dataset</button>}
        </div>
        {resultsModal === 'lengthFrequency' && (
          <div className="modal">
            <div className="modal-content">
              <h2>Length Frequency Distribution</h2>
              <select value={selectedSpecies} onChange={(e) => {
                console.log('Selected Species:', e.target.value);
                setSelectedSpecies(e.target.value);
              }} disabled={isViewOnly}>
                <option value="">Select Species</option>
                {speciesOptions.map(spp => (
                  <option key={spp} value={spp}>{spp}</option>
                ))}
              </select>
              {selectedSpecies && histogramData() ? (
                <Bar
                  key={`length-frequency-${selectedSpecies}`}
                  data={{
                    labels: histogramData().labels,
                    datasets: histogramData().datasets
                  }}
                  options={histogramData().options}
                  height={400}
                />
              ) : (
                <p>Please select a species to view the length frequency histogram.</p>
              )}
              <div className="button-group">
                <button onClick={() => setResultsModal(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
        {resultsModal === 'abundanceCondition' && (
          <div className="modal">
            <div className="modal-content">
              <h2>Survey Statistics and Location</h2>
              <h3>Abundance and Condition</h3>
              {abundanceCondition().length === 0 ? (
                <p>No data available for Abundance and Condition.</p>
              ) : (
                <>
                  <table>
                    <thead>
                      <tr>
                        <th>Species</th>
                        <th>Number</th>
                        <th>CPUE</th>
                        <th>Mean TL (mm)</th>
                        <th>Range TL (mm)</th>
                        <th>Mean WT (g)</th>
                        <th>Range WT (g)</th>
                        <th>Mean Wr</th>
                      </tr>
                    </thead>
                    <tbody>
                      {abundanceCondition().map(row => (
                        <tr key={row.species}>
                          <td>{row.species}{row.usedKFactor ? '*' : ''}</td>
                          <td>{row.count}</td>
                          <td>{row.cpue}</td>
                          <td>{row.meanTL}</td>
                          <td>{row.rangeTL}</td>
                          <td>{row.meanWT}</td>
                          <td>{row.rangeWT}</td>
                          <td>{row.meanWr}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {abundanceCondition().some(row => row.usedKFactor) && (
                    <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                      * Denotes K-Factor analysis was used.
                    </p>
                  )}
                </>
              )}
              <h3>Location Map</h3>
              <div className="form-group">
                <label>Filter by Species</label>
                <select value={selectedSpeciesForMap} onChange={(e) => setSelectedSpeciesForMap(e.target.value)}>
                  <option value="">All Species</option>
                  {speciesOptionsForDiet.map(spp => (
                    <option key={spp} value={spp}>{spp}</option>
                  ))}
                </select>
              </div>
              {waypoints.length > 0 ? (
                <div className="map-container">
                  <MapContainer center={mapCenter} zoom={10} style={{ height: '300px', width: '100%' }}>
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    {waypoints.map(waypoint => (
                      <div key={waypoint.set_id}>
                        <Marker position={waypoint.start} />
                        <Marker position={waypoint.end} />
                        <Polyline 
                          positions={[waypoint.start, waypoint.end]} 
                          color={waypoint.type === 'transect' ? 'blue' : 'red'} 
                        />
                      </div>
                    ))}
                  </MapContainer>
                  <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                    Showing {waypoints.length} location(s) {selectedSpeciesForMap ? `where ${selectedSpeciesForMap} was caught` : 'with fish data'}
                    {selectedSpeciesForMap && ` (Total: ${waypoints.reduce((sum, wp) => sum + wp.fishCount, 0)} fish)`}
                  </p>
                </div>
              ) : (
                <p>No location data available for {selectedSpeciesForMap || 'this survey'}.</p>
              )}
              <h3>Fish Diet Distribution</h3>
              <select value={selectedSpeciesForDiet} onChange={(e) => setSelectedSpeciesForDiet(e.target.value)}>
                <option value="">Select Species</option>
                {speciesOptionsForDiet.map(spp => (
                  <option key={spp} value={spp}>{spp}</option>
                ))}
              </select>
              {selectedSpeciesForDiet && <Pie data={pieData} />}
              <div className="button-group">
                <button onClick={() => setResultsModal(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
        {resultsModal === 'anglerAbundance' && (
          <div className="modal">
            <div className="modal-content">
              <h2>Angler Report</h2>
              {anglerAbundance().length === 0 ? (
                <p>No data available for Angler Report.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Species</th>
                      <th>Number Caught</th>
                      <th>CPUE</th>
                      <th>TL Range (in)</th>
                      <th>Average TL (in)</th>
                      <th>Average WT (lb)</th>
                      <th>Range WT (lb)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anglerAbundance().map(row => (
                      <tr key={row.species}>
                        <td>{row.species}</td>
                        <td>{row.count}</td>
                        <td>{row.cpue}</td>
                        <td>{row.tlRange}</td>
                        <td>{row.avgTL}</td>
                        <td>{row.avgWT}</td>
                        <td>{row.wtRange}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <h3>Fish Diet Distribution</h3>
              <select value={selectedSpeciesForDiet} onChange={(e) => setSelectedSpeciesForDiet(e.target.value)}>
                <option value="">Select Species</option>
                {speciesOptionsForDiet.map(spp => (
                  <option key={spp} value={spp}>{spp}</option>
                ))}
              </select>
              {selectedSpeciesForDiet && <Pie data={pieData} />}
              <div className="button-group">
                <button onClick={() => setResultsModal(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPastEventsPage = () => (
    <div className="past-events-page">
      <h2>NERO Sportfish Data - Past Surveys</h2>
      <div className="past-events-content">
        <div className="left-menu">
          <h3>Menu</h3>
          <button onClick={startNewSurvey}>New Survey</button>
          <div className="form-group">
            <label>Select Lake to Sync</label>
            <select value={selectedLake} onChange={(e) => setSelectedLake(e.target.value)}>
              <option value="">Select a Lake</option>
              {lakeNames.map((lake, index) => (
                <option key={index} value={lake}>{lake}</option>
              ))}
            </select>
          </div>
          <button onClick={fetchEventsFromFirebase}>Sync from Firebase</button>
        </div>
        <div className="right-content">
          {pastEvents.length === 0 ? (
            <p>No past surveys available.</p>
          ) : (
            <>
              <ul>
                {pastEvents.map((event, index) => (
                  <li key={index}>
                    <input
                      type="checkbox"
                      checked={selectedEventIndices.includes(index)}
                      onChange={() => {
                        setSelectedEventIndices(prev =>
                          prev.includes(index)
                            ? prev.filter(i => i !== index)
                            : [...prev, index]
                        );
                      }}
                    />
                    {event.location?.lake} - {event.location?.date} - {event.location?.gear} {event.is_finalized ? '(Finalized)' : '(Unfinalized)'}
                    <button onClick={() => { loadPastEvent(event); setView('input'); }}>Load</button>
                    <button onClick={() => deleteSurvey(event, index)}>Delete Locally</button>
                  </li>
                ))}
              </ul>
              <div className="button-group">
                <button onClick={deleteSelectedEvents}>Delete from Firebase</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // Function to reset the app state for a new survey
  const startNewSurvey = () => {
    setCurrentEvent(null);
    setEventData({
      lake: '', location: '', date: '', observers: '', gear: '',
      cond: '', pH: '', tdS: '', salts: '', temp_water_c: '', amps: '', field_notes: ''
    });
    setGearType('');
    setSelectedTransect(null);
    setFishData({ spp: '', length: '', weight: '', stomach_content: '', sex: '', fats: '', notes: '', count: 1 });
    setSelectedSpecies('');
    setSelectedFishIndices([]);
    setSelectedEventIndices([]);
    setEditingFishIndex(null);
    setIsViewOnly(false);
    localStorage.removeItem('currentEvent');
    setView('input');
    document.title = 'New Survey Input'; // Set the page title to 'New Survey Input'
  };

  // Function to toggle offline mode
  const toggleOfflineMode = () => {
    setIsOfflineMode(!isOfflineMode);
  };

  const isValidUTM = (easting, northing) => {
    return easting >= 100000 && easting <= 999999 && northing >= 0 && northing <= 10000000;
  };

  // Function to get waypoints filtered by species
  const getFilteredWaypoints = (species) => {
    if (!currentEvent?.sets) return [];
    
    const filteredSets = currentEvent.sets.filter(set => {
      if (!species) return true; // Show all if no species selected
      return set.fish.some(fish => fish.spp === species);
    });

    return filteredSets.map(set => {
      const { start_utm_e, end_utm_n } = set.location;
      if (start_utm_e == null || end_utm_n == null) {
        console.error('Invalid coordinates:', start_utm_e, end_utm_n);
        return null;
      }
      try {
        const start = toLatLon(Number(start_utm_e), Number(end_utm_n), 12, 'N');
        const end = toLatLon(Number(start_utm_e) + 10, Number(end_utm_n) + 10, 12, 'N');
        return {
          set_id: set.set_id,
          type: set.type,
          start: [start.latitude, start.longitude],
          end: [end.latitude, end.longitude],
          species: species || 'All Species',
          fishCount: set.fish.filter(fish => !species || fish.spp === species).reduce((sum, fish) => sum + (fish.count || 1), 0)
        };
      } catch (error) {
        console.error('Error converting UTM to Lat/Lon:', error);
        return null;
      }
    }).filter(Boolean);
  };

  return (
    <div>
      <header className="top-bar">
        <h1>NERO Sportfish Data</h1>
        <div className="top-bar-actions">
          {user && (
            <span style={{ color: isOfflineMode ? 'red' : 'black' }}>
              Welcome, {user.displayName || user.email} ({role})
            </span>
          )}
          {user && <button onClick={handleSignOut}>Sign Out</button>}
          <button onClick={() => setView('home')}>Home</button>
          {role === 'admin' && <button onClick={() => setView('admin')}>Admin Panel</button>}
          <button onClick={toggleOfflineMode}>
            {isOfflineMode ? 'Go Online' : 'Go Offline'}
          </button>
        </div>
      </header>
      <div className="main-content">
        {view === 'signIn' ? (
          <div>
            <SignIn onSignIn={() => setView('home')} />
            <p>Don't have an account? <button onClick={() => setView('signUp')}>Sign Up</button></p>
          </div>
        ) : view === 'signUp' ? (
          <div>
            <SignUp onSignUp={() => setView('home')} />
            <p>Already have an account? <button onClick={() => setView('signIn')}>Sign In</button></p>
          </div>
        ) : view === 'admin' ? (
          <Admin />
        ) : view === 'home' ? (
          renderHomePage()
        ) : view === 'input' ? (
          renderInputPage()
        ) : view === 'results' ? (
          renderResultsPage()
        ) : (
          renderPastEventsPage()
        )}
      </div>
    </div>
  );
}

export default App;
