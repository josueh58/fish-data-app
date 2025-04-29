import { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';
import LargemouthBassSpinner from './LargemouthBassSpinner';

function FishDataEntry({ currentEvent, setCurrentEvent, onFinish, setPastEvents, pastEvents, isOfflineMode, updateSet, addFishToSet, reopenModal, setView }) {
  const [fishData, setFishData] = useState({
    spp: '', length: '', weight: '', stomach_content: '', sex: '', fats: '', notes: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState(currentEvent.sets.length > 0 ? currentEvent.sets[0].set_id : null);
  const [speciesCount, setSpeciesCount] = useState({ species: '', count: '' });
  const [speciesCountsList, setSpeciesCountsList] = useState([]);

  const speciesOptions = [
    { code: "BC", name: "Black Crappie" },
    { code: "BLG", name: "Bluegill" },
    { code: "BN", name: "Brown Trout" },
    { code: "LMB", name: "Largemouth Bass" },
    { code: "RBT", name: "Rainbow Trout" },
    { code: "SMB", name: "Smallmouth Bass" },
    { code: "WAE", name: "Walleye" },
    { code: "YP", name: "Yellow Perch" },
    { code: "CARP", name: "Carp" }
  ];

  useEffect(() => {
    const savedEvent = localStorage.getItem('unsavedEvent');
    if (savedEvent && !currentEvent) {
      setCurrentEvent(JSON.parse(savedEvent));
    }
  }, [setCurrentEvent, currentEvent]);

  useEffect(() => {
    if (currentEvent) {
      localStorage.setItem('unsavedEvent', JSON.stringify(currentEvent));
    }
  }, [currentEvent]);

  const handleFishChange = (field, value) => {
    setFishData({ ...fishData, [field]: value });
  };

  const handleSpeciesCountChange = (field, value) => {
    setSpeciesCount({ ...speciesCount, [field]: value });
  };

  const handleAddSpeciesCount = (e) => {
    e.preventDefault();
    const selectedSet = currentEvent.sets.find(set => set.set_id === selectedSetId);
    if (!selectedSet) return alert('Please select a transect or net set.');
    if (selectedSet.type === 'net_set' && !selectedSet.pull_datetime) {
      return alert('Fish data cannot be entered until the net is pulled (pull date/time required).');
    }
    if (!speciesCount.species || !speciesCount.count || speciesCount.count <= 0) {
      return alert('Please select a species and enter a valid count greater than 0.');
    }

    const count = parseInt(speciesCount.count, 10);
    for (let i = 0; i < count; i++) {
      const newFish = {
        spp: speciesCount.species,
        length: null,
        weight: null,
        stomach_content: 'Empty',
        sex: 'Immature',
        fats: '1',
        notes: `Quick add - ${speciesCount.species} (Count: ${count})`
      };
      addFishToSet(selectedSetId, newFish);
    }

    setSpeciesCountsList(prev => {
      const existing = prev.find(item => item.species === speciesCount.species);
      if (existing) {
        return prev.map(item =>
          item.species === speciesCount.species
            ? { ...item, count: item.count + count }
            : item
        );
      }
      return [...prev, { species: speciesCount.species, count }];
    });

    setSpeciesCount({ species: '', count: '' });
  };

  const handleFishSubmit = (e) => {
    e.preventDefault();
    const selectedSet = currentEvent.sets.find(set => set.set_id === selectedSetId);
    if (!selectedSet) return alert('Please select a transect or net set.');
    if (selectedSet.type === 'net_set' && !selectedSet.pull_datetime) {
      return alert('Fish data cannot be entered until the net is pulled (pull date/time required).');
    }
    if (!fishData.spp || fishData.length === '' || fishData.weight === '') {
      return alert('Please fill in all required fields: Species, Length, and Weight.');
    }
    const newFish = {
      spp: fishData.spp,
      length: Number(fishData.length) || null,
      weight: Number(fishData.weight) || null,
      stomach_content: fishData.stomach_content || null, // Optional
      sex: fishData.sex || null, // Optional
      fats: fishData.fats || null, // Optional
      notes: fishData.notes || null // Optional
    };
    console.log('Adding fish to set:', selectedSetId, 'Fish data:', newFish);
    addFishToSet(selectedSetId, newFish);
    console.log('Updated currentEvent after adding fish:', currentEvent);
    setFishData({ spp: '', length: '', weight: '', stomach_content: '', sex: '', fats: '', notes: '' });
  };

  const handleSaveToFirebase = async () => {
    if (isOfflineMode) {
      setPastEvents(prev => [...prev, { ...currentEvent, synced: false }]);
      localStorage.setItem('pastEvents', JSON.stringify([...pastEvents, { ...currentEvent, synced: false }]));
      alert('Offline mode enabled: Event saved locally. Sync it to Firebase from Past Events when online.');
      onFinish();
      return;
    }
    setIsLoading(true);
    try {
      const eventRef = await addDoc(collection(db, 'samplingEvents'), currentEvent);
      const updatedEvent = { ...currentEvent, event_id: eventRef.id, synced: true };
      setCurrentEvent(updatedEvent);
      setPastEvents(prev => [...prev, updatedEvent]);
      localStorage.setItem('pastEvents', JSON.stringify([...pastEvents, updatedEvent]));
      localStorage.removeItem('unsavedEvent');
      alert('Sampling event saved to Firebase!');
      onFinish();
    } catch (error) {
      alert('Error saving to Firebase: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditSiteData = () => {
    setView('event');
  };

  return (
    <div className="fish-entry">
      <h2>NER Sportfish Data - Fish Entry - {currentEvent.location.lake} ({currentEvent.location.date})</h2>
      <div className="section">
        <h3>Select Transect/Net Set</h3>
        <div className="form-group">
          <select value={selectedSetId || ''} onChange={(e) => setSelectedSetId(Number(e.target.value))}>
            <option value="">Select a Set</option>
            {currentEvent.sets.map(set => (
              <option key={set.set_id} value={set.set_id}>
                {currentEvent.gear_type === 'electrofishing' ? `Transect #${set.set_id}` : `Net #${set.set_id}`} 
                {set.type === 'net_set' && !set.pull_datetime && ' (Pending)'}
              </option>
            ))}
          </select>
        </div>
        {selectedSetId && currentEvent.sets.find(set => set.set_id === selectedSetId) && (
          <div>
            <h3>Fish Details</h3>
            <div className="form-group">
              <label>Species (SPP)</label>
              <select value={fishData.spp} onChange={(e) => handleFishChange('spp', e.target.value)} required>
                <option value="">Select Species</option>
                {speciesOptions.map(species => (
                  <option key={species.code} value={species.code}>{`${species.code} - ${species.name}`}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Length (mm)</label>
              <input type="number" step="0.1" value={fishData.length} onChange={(e) => handleFishChange('length', e.target.value)} placeholder="e.g., 300" required />
            </div>
            <div className="form-group">
              <label>Weight (g)</label>
              <input type="number" step="0.1" value={fishData.weight} onChange={(e) => handleFishChange('weight', e.target.value)} placeholder="e.g., 500" required />
            </div>
            <div className="form-group">
              <label>Stomach Content (Optional)</label>
              <select value={fishData.stomach_content} onChange={(e) => handleFishChange('stomach_content', e.target.value)}>
                <option value="">Select Stomach Content</option>
                <option value="Bugs">Bugs</option>
                <option value="Crayfish">Crayfish</option>
                <option value="Unidentified Fish Parts">Unidentified Fish Parts</option>
                <option value="BG">BG</option>
                <option value="YP">YP</option>
                <option value="BC">BC</option>
                <option value="RT">RT</option>
                <option value="Trout">Trout</option>
                <option value="Empty">Empty</option>
              </select>
            </div>
            <div className="form-group">
              <label>Sex (Optional)</label>
              <select value={fishData.sex} onChange={(e) => handleFishChange('sex', e.target.value)}>
                <option value="">Select Sex</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Immature">Immature</option>
              </select>
            </div>
            <div className="form-group">
              <label>Fats (Optional)</label>
              <select value={fishData.fats} onChange={(e) => handleFishChange('fats', e.target.value)}>
                <option value="">Select Fats</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </div>
            <div className="form-group">
              <label>Notes (Optional)</label>
              <input value={fishData.notes} onChange={(e) => handleFishChange('notes', e.target.value)} placeholder="e.g., Healthy" />
            </div>
          </div>
        )}
      </div>
      <div className="section">
        <h3>Species Counts (Quick Add)</h3>
        <form onSubmit={handleAddSpeciesCount}>
          <div className="form-group">
            <label>Species</label>
            <select value={speciesCount.species} onChange={(e) => handleSpeciesCountChange('species', e.target.value)} required>
              <option value="">Select Species</option>
              {speciesOptions.map(species => (
                <option key={species.code} value={species.code}>{`${species.code} - ${species.name}`}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Count</label>
            <input
              type="number"
              min="1"
              value={speciesCount.count}
              onChange={(e) => handleSpeciesCountChange('count', e.target.value)}
              placeholder="e.g., 5"
              required
            />
          </div>
          <div className="button-group">
            <button type="submit">Add Species Count</button>
          </div>
        </form>
        {speciesCountsList.length > 0 && (
          <>
            <h4>Species Counts Summary</h4>
            <table>
              <thead>
                <tr>
                  <th>Species</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {speciesCountsList.map((item, index) => (
                  <tr key={index}>
                    <td>{item.species}</td>
                    <td>{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
      <div className="button-group">
        <button onClick={handleFishSubmit} disabled={isLoading || !selectedSetId || (currentEvent.sets.find(set => set.set_id === selectedSetId)?.type === 'net_set' && !currentEvent.sets.find(set => set.set_id === selectedSetId).pull_datetime)}>
          Add Fish
        </button>
        <button onClick={reopenModal}>Add New Transect/Net Set</button>
        <button onClick={handleEditSiteData}>Edit Site Data</button>
        <button onClick={handleSaveToFirebase} disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save to Firebase'}
        </button>
      </div>
      {isLoading && (
        <div className="loading-spinner">
          <LargemouthBassSpinner />
        </div>
      )}
      <h3>Summary of Fish Entered</h3>
      <table>
        <thead>
          <tr>
            <th>Set #</th><th>Species</th><th>Length (mm)</th><th>Weight (g)</th><th>Stomach Content</th><th>Sex</th><th>Fats</th><th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {currentEvent.sets
            .filter(set => set.set_id === selectedSetId)
            .map(set => set.fish.map((fish, index) => (
              <tr key={`${set.set_id}-${index}`}>
                <td>{set.set_id}</td>
                <td>{fish.spp}</td><td>{fish.length}</td><td>{fish.weight}</td><td>{fish.stomach_content}</td>
                <td>{fish.sex}</td><td>{fish.fats}</td><td>{fish.notes}</td>
              </tr>
            )))}
        </tbody>
      </table>
    </div>
  );
}

export default FishDataEntry;