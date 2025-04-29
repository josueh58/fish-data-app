import { useState, useEffect, Component } from 'react';
import { db } from './firebase';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { Bar } from 'react-chartjs-2';
import Chart from 'chart.js/auto';
import { Chart as ChartJS } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import speciesData from './speciesData';
import './App.css';

ChartJS.register(annotationPlugin);

// Error Boundary Component
class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return <h1>Something went wrong. Please refresh the page.</h1>;
    }
    return this.props.children;
  }
}

function App() {
  const [view, setView] = useState('input');
  const [eventData, setEventData] = useState({
    lake: '', location: '', date: '', observers: '', gear: '',
    cond: '', pH: '', tdS: '', salts: '', temp_water_c: '', amps: '', field_notes: ''
  });
  const [currentEvent, setCurrentEvent] = useState(null);
  const [pastEvents, setPastEvents] = useState([]);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [gearType, setGearType] = useState('');
  const [selectedTransect, setSelectedTransect] = useState(null);
  const [fishData, setFishData] = useState({ spp: '', length: '', weight: '', stomach_content: '', sex: '', fats: '', notes: '' });
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [showEditNetModal, setShowEditNetModal] = useState(false);
  const [editingSetId, setEditingSetId] = useState(null);
  const [editNetData, setEditNetData] = useState({ pull_datetime: '', start_utm_e: '', end_utm_n: '' });
  const [selectedFishIndices, setSelectedFishIndices] = useState([]);
  const [selectedEventIndices, setSelectedEventIndices] = useState([]);
  const [showModal, setShowModal] = useState(null); // null, 'environmental', 'transect', 'fish'
  const [resultsModal, setResultsModal] = useState(null); // null, 'lengthFrequency', 'abundanceCondition', 'anglerAbundance'
  const [editingFishIndex, setEditingFishIndex] = useState(null); // null or index of fish being edited
  const [selectedDate, setSelectedDate] = useState(''); // New state for date filter

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
    setPastEvents(storedPastEvents);
  }, []);

  const fetchEventsFromFirebase = async () => {
    if (isOfflineMode) {
      alert('Cannot sync with Firebase in offline mode.');
      return;
    }
    if (!selectedDate) {
      alert('Please select a date to sync events.');
      return;
    }
    try {
      const q = query(collection(db, 'samplingEvents'), where('location.date', '==', selectedDate));
      const querySnapshot = await getDocs(q);
      const firebaseEvents = querySnapshot.docs.map(doc => ({
        ...doc.data(),
        firebaseId: doc.id
      }));
      // Merge with local pastEvents, avoiding duplicates
      const existingIds = new Set(pastEvents.map(e => e.firebaseId || `${e.location.lake}-${e.location.date}`));
      const newEvents = firebaseEvents.filter(e => !existingIds.has(e.firebaseId || `${e.location.lake}-${e.location.date}`));
      const updatedEvents = [...pastEvents, ...newEvents];
      setPastEvents(updatedEvents);
      localStorage.setItem('pastEvents', JSON.stringify(updatedEvents));
      alert(`Successfully synced ${newEvents.length} events from ${selectedDate}!`);
    } catch (error) {
      alert('Error syncing from Firebase: ' + error.message);
    }
  };

  const handleEventChange = (field, value) => {
    setEventData({ ...eventData, [field]: value });
  };

  const handleFishChange = (field, value) => {
    setFishData({ ...fishData, [field]: value });
  };

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
    setShowModal(null);
  };

  const addTransect = (e) => {
    e.preventDefault();
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
    setShowModal(null);
  };

  const addNetSet = (e) => {
    e.preventDefault();
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
    setShowModal(null);
  };

  const openEditNetModal = (setId) => {
    const set = currentEvent.sets.find(s => s.set_id === setId);
    if (set) {
      setEditNetData({
        pull_datetime: set.pull_datetime || '',
        start_utm_e: set.location.start_utm_e || '',
        end_utm_n: set.location.end_utm_n || ''
      });
      setEditingSetId(setId);
      setShowEditNetModal(true);
    }
  };

  const handleEditNetSubmit = (e) => {
    e.preventDefault();
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
          newSet.cpue = newSet.fish.length / newSet.soak_time_hours;
        }
        return newSet;
      }
      return set;
    });
    const updatedEvent = { ...currentEvent, sets: updatedSets };
    setCurrentEvent(updatedEvent);
    localStorage.setItem('currentEvent', JSON.stringify(updatedEvent));
    setShowEditNetModal(false);
    setEditNetData({ pull_datetime: '', start_utm_e: '', end_utm_n: '' });
    setEditingSetId(null);
  };

  const addFish = (e) => {
    e.preventDefault();
    if (!selectedTransect) {
      alert('Please select a transect or net set before adding fish.');
      return;
    }
    const newFish = {
      spp: fishData.spp,
      length: Number(fishData.length) || null,
      weight: Number(fishData.weight) || null,
      stomach_content: fishData.stomach_content,
      sex: fishData.sex,
      fats: fishData.fats,
      notes: fishData.notes
    };
    const updatedSets = currentEvent.sets.map(set => {
      if (set.set_id === selectedTransect) {
        const updatedSet = { ...set, fish: [...set.fish, newFish] };
        updatedSet.cpue = updatedSet.fish.length / (updatedSet.effort_time_hours || updatedSet.soak_time_hours || 1);
        return updatedSet;
      }
      return set;
    });
    const updatedEvent = { ...currentEvent, sets: updatedSets };
    setCurrentEvent(updatedEvent);
    localStorage.setItem('currentEvent', JSON.stringify(updatedEvent));
    setFishData({ spp: '', length: '', weight: '', stomach_content: '', sex: '', fats: '', notes: '' });
    setSelectedFishIndices([]);
    // Modal remains open
  };

  const updateFish = (e) => {
    e.preventDefault();
    if (!selectedTransect || editingFishIndex === null) {
      alert('Please select a fish entry to update.');
      return;
    }
    const updatedFish = {
      spp: fishData.spp,
      length: Number(fishData.length) || null,
      weight: Number(fishData.weight) || null,
      stomach_content: fishData.stomach_content,
      sex: fishData.sex,
      fats: fishData.fats,
      notes: fishData.notes
    };
    const updatedSets = currentEvent.sets.map(set => {
      if (set.set_id === selectedTransect) {
        const updatedFishArray = set.fish.map((fish, index) =>
          index === editingFishIndex ? updatedFish : fish
        );
        const updatedSet = { ...set, fish: updatedFishArray };
        updatedSet.cpue = updatedSet.fish.length / (updatedSet.effort_time_hours || updatedSet.soak_time_hours || 1);
        return updatedSet;
      }
      return set;
    });
    const updatedEvent = { ...currentEvent, sets: updatedSets };
    setCurrentEvent(updatedEvent);
    localStorage.setItem('currentEvent', JSON.stringify(updatedEvent));
    setFishData({ spp: '', length: '', weight: '', stomach_content: '', sex: '', fats: '', notes: '' });
    setEditingFishIndex(null);
    setSelectedFishIndices([]);
  };

  const deleteSelectedFish = () => {
    if (!selectedTransect || selectedFishIndices.length === 0) {
      alert('Please select fish entries to delete.');
      return;
    }
    const updatedSets = currentEvent.sets.map(set => {
      if (set.set_id === selectedTransect) {
        const updatedFish = set.fish.filter((_, index) => !selectedFishIndices.includes(index));
        const updatedSet = { ...set, fish: updatedFish };
        updatedSet.cpue = updatedSet.fish.length / (updatedSet.effort_time_hours || updatedSet.soak_time_hours || 1);
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

  const deleteSelectedEvents = () => {
    if (selectedEventIndices.length === 0) {
      alert('Please select past events to delete.');
      return;
    }
    const updatedEvents = pastEvents.filter((_, index) => !selectedEventIndices.includes(index));
    setPastEvents(updatedEvents);
    localStorage.setItem('pastEvents', JSON.stringify(updatedEvents));
    setSelectedEventIndices([]);
  };

  const saveEventToFirebase = async () => {
    if (isOfflineMode) {
      const updatedEvents = [...pastEvents, { ...currentEvent, is_finalized: true }];
      setPastEvents(updatedEvents);
      localStorage.setItem('pastEvents', JSON.stringify(updatedEvents));
      alert('Offline mode enabled: Event finalized and saved locally. It will sync when you go online.');
      resetApp();
      return;
    }
    try {
      await addDoc(collection(db, 'samplingEvents'), { ...currentEvent, is_finalized: true });
      alert('Event finalized and saved to Firebase!');
      resetApp();
    } catch (error) {
      alert('Error finalizing event in Firebase: ' + error.message);
    }
  };

  const saveAsUnfinalized = () => {
    const updatedEvents = [...pastEvents, { ...currentEvent, is_finalized: false }];
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
    const fishHeader = ['SPP', 'TL_mm', 'WT_g', 'Sex', 'Stomach Content', 'Notes'];

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

  const catchSummary = () => {
    if (!currentEvent || !currentEvent.sets) return [];
    const speciesData = {};
    currentEvent.sets.forEach(set => {
      set.fish.forEach(fish => {
        if (!fish.spp) return;
        if (!speciesData[fish.spp]) {
          speciesData[fish.spp] = { count: 0, biomass: 0 };
        }
        speciesData[fish.spp].count += 1;
        speciesData[fish.spp].biomass += fish.weight || 0;
      });
    });

    const totalCount = Object.values(speciesData).reduce((sum, d) => sum + d.count, 0);
    const totalBiomass = Object.values(speciesData).reduce((sum, d) => sum + d.biomass, 0);

    return Object.keys(speciesData).map(spp => ({
      species: spp,
      number: speciesData[spp].count,
      numberPercent: totalCount > 0 ? ((speciesData[spp].count / totalCount) * 100).toFixed(1) : 0,
      biomass: (speciesData[spp].biomass / 1000).toFixed(2),
      biomassPercent: totalBiomass > 0 ? ((speciesData[spp].biomass / totalBiomass) * 100).toFixed(1) : 0,
    }));
  };

  const abundanceCondition = () => {
    if (!currentEvent || !currentEvent.sets) return [];
    const speciesStats = {};
    currentEvent.sets.forEach(set => {
      set.fish.forEach(fish => {
        if (!fish.spp) return;
        if (!speciesStats[fish.spp]) speciesStats[fish.spp] = { count: 0, tl: [], wt: [], wr: [] };
        speciesStats[fish.spp].count += 1;
        if (fish.length) speciesStats[fish.spp].tl.push(fish.length);
        if (fish.weight) {
          speciesStats[fish.spp].wt.push(fish.weight);
          const speciesCoefficients = speciesData[fish.spp];
          if (speciesCoefficients && speciesCoefficients.a && speciesCoefficients.b && fish.length) {
            const logWs = speciesCoefficients.a + speciesCoefficients.b * Math.log10(fish.length);
            const Ws = Math.pow(10, logWs);
            const Wr = (fish.weight / Ws) * 100;
            speciesStats[fish.spp].wr.push(Wr);
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
      const meanTL = tl.length ? (tl.reduce((a, b) => a + b, 0) / tl.length).toFixed(1) : 0;
      const rangeTL = tl.length ? `${Math.min(...tl)}-${Math.max(...tl)}` : '-';
      const meanWT = wt.length ? (wt.reduce((a, b) => a + b, 0) / wt.length).toFixed(1) : 0;
      const rangeWT = wt.length ? `${Math.min(...wt)}-${Math.max(...wt)}` : '-';
      const meanWr = wr.length ? (wr.reduce((a, b) => a + b, 0) / wr.length).toFixed(1) : '-';
      const speciesCpue = totalEffortOrSoakHours > 0 ? (count / Number(totalEffortOrSoakHours)).toFixed(2) : 0;
      return { species: spp, count, cpue: speciesCpue, meanTL, rangeTL, meanWT, rangeWT, meanWr };
    });
  };

  const anglerAbundance = () => {
    if (!currentEvent || !currentEvent.sets) return [];
    const speciesStats = {};
    currentEvent.sets.forEach(set => {
      set.fish.forEach(fish => {
        if (!fish.spp) return;
        if (!speciesStats[fish.spp]) speciesStats[fish.spp] = { count: 0, tl: [], wt: [] };
        speciesStats[fish.spp].count += 1;
        if (fish.length) speciesStats[fish.spp].tl.push(fish.length / 25.4); // Convert mm to inches
        if (fish.weight) speciesStats[fish.spp].wt.push(fish.weight / 453.592); // Convert grams to pounds
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

  const histogramData = () => {
    if (!currentEvent || !currentEvent.sets || !selectedSpecies) return null;

    // Clear previous data to prevent accumulation
    const lengths = currentEvent.sets
      .flatMap(set => set.fish || [])
      .filter(fish => fish.spp === selectedSpecies && fish.length !== null && !isNaN(fish.length))
      .map(fish => fish.length / 25.4);

    if (lengths.length === 0) return null;

    // Cap bin range to avoid excessive growth
    const minLength = Math.max(Math.floor(Math.min(...lengths)) - 1, 0);
    const maxLength = Math.min(Math.ceil(Math.max(...lengths)) + 1, 100); // Cap at 100 inches
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
            title: { display: true, text: 'Total Length (inches)' },
            ticks: { stepSize: 1 }
          },
          y: {
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
                xValue: minLength + 0.5,
                yValue: maxY * 0.95,
                content: `n=${lengths.length}`,
                font: { weight: 'bold', size: 12, color: '#008080' },
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

  const resetApp = () => {
    setView('input');
    setCurrentEvent(null);
    setEventData({
      lake: '', location: '', date: '', observers: '', gear: '',
      cond: '', pH: '', tdS: '', salts: '', temp_water_c: '', amps: '', field_notes: ''
    });
    setFishData({ spp: '', length: '', weight: '', stomach_content: '', sex: '', fats: '', notes: '' });
    setGearType('');
    setSelectedTransect(null);
    setSelectedSpecies('');
    setSelectedFishIndices([]);
    setSelectedEventIndices([]);
    setEditingFishIndex(null);
    localStorage.removeItem('currentEvent');
  };

  const renderEnvironmentalDashboard = () => (
    <div className="form-container">
      <div className="section site-info">
        <h4>Site Information</h4>
        <div className="form-group">
          <label>Lake</label>
          <input value={eventData.lake} onChange={(e) => handleEventChange('lake', e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Location</label>
          <input value={eventData.location} onChange={(e) => handleEventChange('location', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Date</label>
          <input type="date" value={eventData.date} onChange={(e) => handleEventChange('date', e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Observers</label>
          <input value={eventData.observers} onChange={(e) => handleEventChange('observers', e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Gear</label>
          <select value={eventData.gear} onChange={(e) => { handleEventChange('gear', e.target.value); setGearType(e.target.value); }} required>
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
          />
        </div>
      </div>
      <div className="section environmental-data">
        <h4>Environmental Data</h4>
        <div className="form-group">
          <label>pH</label>
          <input type="number" step="0.1" value={eventData.pH} onChange={(e) => handleEventChange('pH', e.target.value)} placeholder="e.g., 7.5" />
        </div>
        <div className="form-group">
          <label>Temp (°C)</label>
          <input type="number" step="0.1" value={eventData.temp_water_c} onChange={(e) => handleEventChange('temp_water_c', e.target.value)} placeholder="e.g., 20.0" />
        </div>
        <div className="form-group">
          <label>Cond</label>
          <input type="number" value={eventData.cond} onChange={(e) => handleEventChange('cond', e.target.value)} placeholder="e.g., 500" />
        </div>
        <div className="form-group">
          <label>tdS</label>
          <input type="number" value={eventData.tdS} onChange={(e) => handleEventChange('tdS', e.target.value)} placeholder="e.g., 300" />
        </div>
        <div className="form-group">
          <label>Salts</label>
          <input type="number" step="0.1" value={eventData.salts} onChange={(e) => handleEventChange('salts', e.target.value)} placeholder="e.g., 0.5" />
        </div>
        <div className="form-group">
          <label>AMPS</label>
          <input type="number" step="0.1" value={eventData.amps} onChange={(e) => handleEventChange('amps', e.target.value)} placeholder="e.g., 10.0" />
        </div>
      </div>
      <div className="button-group">
        <button onClick={handleEventSubmit}>Save Environmental Data</button>
        <button type="button" onClick={() => setShowModal(null)}>Close</button>
      </div>
    </div>
  );

  const renderTransectDashboard = () => (
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
                <button onClick={() => openEditNetModal(set.set_id)}>Edit Pull Date/Location</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="button-group">
        <button onClick={addTransect} disabled={gearType !== 'electrofishing'}>Add Transect</button>
        <button onClick={addNetSet} disabled={gearType !== 'gillnet' && gearType !== 'fyke_net'}>Add Net Set</button>
      </div>
      <form id="transectForm" style={{ display: gearType === 'electrofishing' ? 'block' : 'none' }}>
        <input type="number" id="effortTimeSec" placeholder="Effort Time (seconds)" required />
        <input type="number" id="startUtmE" placeholder="Start UTM_E" required />
        <input type="number" id="endUtmN" placeholder="End UTM_N" required />
        <button type="submit" onClick={addTransect}>Add Transect</button>
      </form>
      <form id="netSetForm" style={{ display: (gearType === 'gillnet' || gearType === 'fyke_net') ? 'block' : 'none' }}>
        <input type="datetime-local" id="setDatetime" placeholder="Set Date and Time" required />
        <input type="number" id="startUtmENet" placeholder="Start UTM_E" required />
        <input type="number" id="endUtmNNet" placeholder="End UTM_N" required />
        <button type="submit" onClick={addNetSet}>Add Net Set</button>
      </form>
      <div className="button-group">
        <button type="button" onClick={() => setShowModal(null)}>Close</button>
      </div>
    </div>
  );

  const renderFishDashboard = () => (
    <div>
      <form onSubmit={editingFishIndex === null ? addFish : updateFish}>
        <div className="form-group">
          <label>Net Set/Transect</label>
          <select
            value={selectedTransect || ''}
            onChange={(e) => setSelectedTransect(Number(e.target.value))}
            required
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
          >
            <option value="">Select Species</option>
            {Object.keys(speciesData).map(spp => (
              <option key={spp} value={spp}>{speciesData[spp].name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Length (mm)</label>
          <input type="number" value={fishData.length} onChange={(e) => handleFishChange('length', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Weight (g)</label>
          <input type="number" value={fishData.weight} onChange={(e) => handleFishChange('weight', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Stomach Content</label>
          <input value={fishData.stomach_content} onChange={(e) => handleFishChange('stomach_content', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Sex</label>
          <input value={fishData.sex} onChange={(e) => handleFishChange('sex', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Fats</label>
          <input value={fishData.fats} onChange={(e) => handleFishChange('fats', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Notes</label>
          <input value={fishData.notes} onChange={(e) => handleFishChange('notes', e.target.value)} />
        </div>
        <div className="button-group">
          <button type="submit">{editingFishIndex === null ? 'Add Fish' : 'Update Fish'}</button>
          <button
            type="button"
            onClick={() => {
              if (!selectedTransect) {
                alert('Please select a transect or net set before adding fish.');
                return;
              }
              const newFish = { spp: 'Carp', length: null, weight: null, stomach_content: '', sex: '', fats: '', notes: '' };
              const updatedSets = currentEvent.sets.map(set => {
                if (set.set_id === selectedTransect) {
                  const updatedSet = { ...set, fish: [...set.fish, newFish] };
                  updatedSet.cpue = updatedSet.fish.length / (updatedSet.effort_time_hours || updatedSet.soak_time_hours || 1);
                  return updatedSet;
                }
                return set;
              });
              const updatedEvent = { ...currentEvent, sets: updatedSets };
              setCurrentEvent(updatedEvent);
              localStorage.setItem('currentEvent', JSON.stringify(updatedEvent));
            }}
          >
            Add Carp (No Length)
          </button>
          {editingFishIndex !== null && (
            <button
              type="button"
              onClick={() => {
                setFishData({ spp: '', length: '', weight: '', stomach_content: '', sex: '', fats: '', notes: '' });
                setEditingFishIndex(null);
              }}
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
                            if (selectedFishIndices.includes(index)) {
                              setEditingFishIndex(index);
                              setFishData({
                                spp: fish.spp || '',
                                length: fish.length || '',
                                weight: fish.weight || '',
                                stomach_content: fish.stomach_content || '',
                                sex: fish.sex || '',
                                fats: fish.fats || '',
                                notes: fish.notes || ''
                              });
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) ? 'pointer' : 'default' }}
                        >
                          {selectedTransect}
                        </td>
                        <td
                          onClick={() => {
                            if (selectedFishIndices.includes(index)) {
                              setEditingFishIndex(index);
                              setFishData({
                                spp: fish.spp || '',
                                length: fish.length || '',
                                weight: fish.weight || '',
                                stomach_content: fish.stomach_content || '',
                                sex: fish.sex || '',
                                fats: fish.fats || '',
                                notes: fish.notes || ''
                              });
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) ? 'pointer' : 'default' }}
                        >
                          {speciesData[fish.spp]?.name || fish.spp}
                        </td>
                        <td
                          onClick={() => {
                            if (selectedFishIndices.includes(index)) {
                              setEditingFishIndex(index);
                              setFishData({
                                spp: fish.spp || '',
                                length: fish.length || '',
                                weight: fish.weight || '',
                                stomach_content: fish.stomach_content || '',
                                sex: fish.sex || '',
                                fats: fish.fats || '',
                                notes: fish.notes || ''
                              });
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) ? 'pointer' : 'default' }}
                        >
                          {fish.length || '-'}
                        </td>
                        <td
                          onClick={() => {
                            if (selectedFishIndices.includes(index)) {
                              setEditingFishIndex(index);
                              setFishData({
                                spp: fish.spp || '',
                                length: fish.length || '',
                                weight: fish.weight || '',
                                stomach_content: fish.stomach_content || '',
                                sex: fish.sex || '',
                                fats: fish.fats || '',
                                notes: fish.notes || ''
                              });
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) ? 'pointer' : 'default' }}
                        >
                          {fish.weight || '-'}
                        </td>
                        <td
                          onClick={() => {
                            if (selectedFishIndices.includes(index)) {
                              setEditingFishIndex(index);
                              setFishData({
                                spp: fish.spp || '',
                                length: fish.length || '',
                                weight: fish.weight || '',
                                stomach_content: fish.stomach_content || '',
                                sex: fish.sex || '',
                                fats: fish.fats || '',
                                notes: fish.notes || ''
                              });
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) ? 'pointer' : 'default' }}
                        >
                          {fish.sex || '-'}
                        </td>
                        <td
                          onClick={() => {
                            if (selectedFishIndices.includes(index)) {
                              setEditingFishIndex(index);
                              setFishData({
                                spp: fish.spp || '',
                                length: fish.length || '',
                                weight: fish.weight || '',
                                stomach_content: fish.stomach_content || '',
                                sex: fish.sex || '',
                                fats: fish.fats || '',
                                notes: fish.notes || ''
                              });
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) ? 'pointer' : 'default' }}
                        >
                          {fish.stomach_content || '-'}
                        </td>
                        <td
                          onClick={() => {
                            if (selectedFishIndices.includes(index)) {
                              setEditingFishIndex(index);
                              setFishData({
                                spp: fish.spp || '',
                                length: fish.length || '',
                                weight: fish.weight || '',
                                stomach_content: fish.stomach_content || '',
                                sex: fish.sex || '',
                                fats: fish.fats || '',
                                notes: fish.notes || ''
                              });
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) ? 'pointer' : 'default' }}
                        >
                          {fish.fats || '-'}
                        </td>
                        <td
                          onClick={() => {
                            if (selectedFishIndices.includes(index)) {
                              setEditingFishIndex(index);
                              setFishData({
                                spp: fish.spp || '',
                                length: fish.length || '',
                                weight: fish.weight || '',
                                stomach_content: fish.stomach_content || '',
                                sex: fish.sex || '',
                                fats: fish.fats || '',
                                notes: fish.notes || ''
                              });
                            }
                          }}
                          style={{ cursor: selectedFishIndices.includes(index) ? 'pointer' : 'default' }}
                        >
                          {fish.notes || '-'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <div className="button-group">
                <button onClick={deleteSelectedFish}>Delete Selected</button>
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
      <h2>NER Sportfish Data - Input</h2>
      <div className="dashboard-container">
        <div className="dashboard dashboard-compact" onClick={() => setShowModal('environmental')}>
          <h3>Environmental Data</h3>
          <p>Click to enter site information and environmental data (e.g., Lake, pH, Temp).</p>
        </div>
        {currentEvent && (
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
            <button onClick={() => setView('results')}>View Event Results</button>
            <button onClick={exportToExcel}>Download Dataset</button>
            <button onClick={saveEventToFirebase}>Finalize Event</button>
            <button onClick={saveAsUnfinalized}>Save as Unfinalized</button>
          </>
        )}
        <button onClick={() => setView('past')}>Past Events</button>
      </div>
      {showModal === 'environmental' && (
        <div className="modal">
          <div className="modal-content">
            <h2>Environmental Data</h2>
            {renderEnvironmentalDashboard()}
          </div>
        </div>
      )}
      {showModal === 'transect' && (
        <div className="modal">
          <div className="modal-content">
            <h2>Transect/Net Set Data</h2>
            {renderTransectDashboard()}
          </div>
        </div>
      )}
      {showModal === 'fish' && (
        <div className="modal">
          <div className="modal-content">
            <h2>Fish Data</h2>
            {renderFishDashboard()}
          </div>
        </div>
      )}
    </div>
  );

  const renderResultsPage = () => (
    <div className="results-page">
      <h2>NER Sportfish Data - Event Results</h2>
      <div className="dashboard-container">
        <div className="dashboard dashboard-compact" onClick={() => setResultsModal('lengthFrequency')}>
          <h3>Length Frequency</h3>
          <p>Click to view length frequency histogram for selected species.</p>
        </div>
        <div className="dashboard dashboard-compact" onClick={() => setResultsModal('abundanceCondition')}>
          <h3>Abundance and Condition</h3>
          <p>Click to view abundance and condition metrics (CPUE, TL, WT, Wr).</p>
        </div>
        <div className="dashboard dashboard-compact" onClick={() => setResultsModal('anglerAbundance')}>
          <h3>Angler Abundance</h3>
          <p>Click to view angler-focused metrics (CPUE, TL in inches, WT in pounds).</p>
        </div>
        <div className="dashboard dashboard-compact">
          <h3>Event Metrics</h3>
          <p>Total Fish: {currentEvent.sets.reduce((sum, set) => sum + (set.fish ? set.fish.length : 0), 0)}</p>
          <p>Total Effort: {(currentEvent.sets.reduce((sum, set) => sum + (Number(set.effort_time_hours || set.soak_time_hours) || 0), 0)).toFixed(2)} hours</p>
          <p>Event CPUE: {currentEvent.sets.reduce((sum, set) => sum + (set.fish ? set.fish.length : 0), 0) / currentEvent.sets.reduce((sum, set) => sum + (Number(set.effort_time_hours || set.soak_time_hours) || 0), 0) || 'N/A'}</p>
        </div>
      </div>
      <div className="button-group">
        <button onClick={() => setView('input')}>Back to Input</button>
        <button onClick={exportToExcel}>Download Dataset</button>
      </div>
      {resultsModal === 'lengthFrequency' && (
        <div className="modal">
          <div className="modal-content">
            <h2>Length Frequency</h2>
            <select value={selectedSpecies} onChange={(e) => setSelectedSpecies(e.target.value)}>
              <option value="">Select Species</option>
              {speciesOptions.map(spp => (
                <option key={spp} value={spp}>{spp}</option>
              ))}
            </select>
            {selectedSpecies && histogramData() ? (
              <Bar
                key={selectedSpecies}
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
            <h2>Abundance and Condition</h2>
            {abundanceCondition().length === 0 ? (
              <p>No data available for Abundance and Condition.</p>
            ) : (
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
                      <td>{row.species}</td>
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
            )}
            <div className="button-group">
              <button onClick={() => setResultsModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {resultsModal === 'anglerAbundance' && (
        <div className="modal">
          <div className="modal-content">
            <h2>Angler Abundance</h2>
            {anglerAbundance().length === 0 ? (
              <p>No data available for Angler Abundance.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Species</th>
                    <th>Number</th>
                    <th>CPUE</th>
                    <th>TL Range (in)</th>
                    <th>Avg TL (in)</th>
                    <th>WT Range (lb)</th>
                    <th>Avg WT (lb)</th>
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
                      <td>{row.wtRange}</td>
                      <td>{row.avgWT}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="button-group">
              <button onClick={() => setResultsModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderPastEventsPage = () => (
    <div className="past-events-page">
      <h2>NER Sportfish Data - Past Events</h2>
      <div className="dashboard-container">
        <div className="dashboard dashboard-compact">
          <div className="past-events-content">
            <div className="left-menu">
              <h3>Menu</h3>
              <button onClick={() => setView('input')}>New Event</button>
              <div className="form-group">
                <label>Select Date to Sync</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <button onClick={fetchEventsFromFirebase}>Sync from Firebase</button>
            </div>
            <div className="right-content">
              {pastEvents.length === 0 ? (
                <p>No past events available.</p>
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
                      </li>
                    ))}
                  </ul>
                  <div className="button-group">
                    <button onClick={deleteSelectedEvents}>Delete Selected</button>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="button-group">
            <button onClick={() => setView('input')}>Back to Input</button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <ErrorBoundary>
      <div>
        <header className="top-bar">
          <h1>NER Sportfish Data</h1>
          <div className="top-bar-actions">
            <div className="offline-toggle">
              <input
                type="checkbox"
                checked={isOfflineMode}
                onChange={() => setIsOfflineMode(!isOfflineMode)}
              />
              <span>Offline</span>
            </div>
          </div>
        </header>
        <div className="main-content">
          <div className="logo-container">
            <img src="/ner-sportfish-logo.png" alt="NER Sportfish Data Logo" className="app-logo" />
          </div>
          {view === 'input' ? renderInputPage() : view === 'results' ? renderResultsPage() : renderPastEventsPage()}
        </div>
        {showEditNetModal && (
          <div className="modal">
            <div className="modal-content">
              <h2>Edit Net Pull Date/Location</h2>
              <form id="editNetForm" onSubmit={handleEditNetSubmit}>
                <div className="form-group">
                  <label>Pull Date and Time</label>
                  <input type="datetime-local" id="editPullDatetime" value={editNetData.pull_datetime} onChange={(e) => setEditNetData({ ...editNetData, pull_datetime: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Start UTM_E</label>
                  <input type="number" id="editStartUtmE" value={editNetData.start_utm_e} onChange={(e) => setEditNetData({ ...editNetData, start_utm_e: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>End UTM_N</label>
                  <input type="number" id="editEndUtmN" value={editNetData.end_utm_n} onChange={(e) => setEditNetData({ ...editNetData, end_utm_n: e.target.value })} required />
                </div>
                <div className="button-group">
                  <button type="submit">Save Changes</button>
                  <button type="button" onClick={() => setShowEditNetModal(false)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default App;