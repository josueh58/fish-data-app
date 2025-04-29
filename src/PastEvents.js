import { useState, useEffect, useRef } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import Chart from 'chart.js/auto';
import { Chart as ChartJS } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { db } from './firebase';
import { collection, addDoc, query, orderBy, getDocs, where } from 'firebase/firestore';
import speciesData from './speciesData';

ChartJS.register(annotationPlugin);

function PastEvents({ pastEvents, onSelect, onBack, setPastEvents }) {
  const [years, setYears] = useState([]);
  const [yearEvents, setYearEvents] = useState({});
  const [expandedYears, setExpandedYears] = useState({});
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const chartRef = useRef(null);
  const pieChartRef = useRef(null);

  useEffect(() => {
    const fetchYears = async () => {
      const q = query(collection(db, 'samplingEvents'), orderBy('season', 'desc'));
      const snapshot = await getDocs(q);
      const uniqueYears = [...new Set(snapshot.docs.map(doc => doc.data().season))].filter(Boolean);
      setYears(uniqueYears);
    };
    fetchYears();

    const updatedPastEvents = pastEvents.map(event => ({
      ...event,
      season: event.season || new Date(event.location?.date).getFullYear().toString()
    }));
    setPastEvents(updatedPastEvents);
    localStorage.setItem('pastEvents', JSON.stringify(updatedPastEvents));
  }, [pastEvents, setPastEvents]);

  const handleSendToFirebase = async (event, index) => {
    try {
      const eventRef = await addDoc(collection(db, 'samplingEvents'), { ...event, season: event.season || new Date(event.location?.date).getFullYear().toString() });
      const updatedEvent = { ...event, event_id: eventRef.id, synced: true };
      const updatedEvents = [...pastEvents];
      updatedEvents[index] = updatedEvent;
      setPastEvents(updatedEvents);
      localStorage.setItem('pastEvents', JSON.stringify(updatedEvents));
      alert('Event successfully sent to Firebase!');
    } catch (error) {
      alert('Error sending to Firebase: ' + error.message);
    }
  };

  const fetchEventsByYear = async (year) => {
    const q = query(collection(db, 'samplingEvents'), where('season', '==', year), orderBy('lake'), orderBy('date'));
    const snapshot = await getDocs(q);
    const events = snapshot.docs.map(doc => ({ ...doc.data(), event_id: doc.id }));
    setYearEvents(prev => ({ ...prev, [year]: events }));
    setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }));
    if (events.length > 0) setSelectedEvent(events[0]);
  };

  const exportToExcel = (data, filename, format = 'xlsx') => {
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${filename}.${format}`);
  };

  const exportFullDataset = (format = 'xlsx') => {
    if (!selectedEvent || !selectedEvent.sets) return;

    const lakeName = selectedEvent.location.lake?.replace(/\s+/g, '_') || 'UnknownLake';
    const eventDate = selectedEvent.location.date?.replace(/-/g, '') || 'UnknownDate';
    const filename = `${lakeName}_${eventDate}`;

    const headers = [
      'Lake', 'Observers', 'Month', 'Day', 'Year', 'Gear', 'Transect #', 'Start UTM_E', 'End UTM_N', 
      'Location', 'Effort_time (sec)', 'Cond', 'pH', 'tdS', 'Salts', 'Temp_Water_C', 'AMPS'
    ];
    const fishHeader = ['SPP', 'TL_mm', 'WT_g', 'Stomach Content', 'Notes'];
    const fullData = [];

    selectedEvent.sets.forEach(set => {
      const transectData = [
        selectedEvent.location.lake || 'N/A',
        selectedEvent.location.observers || 'N/A',
        selectedEvent.location.date ? new Date(selectedEvent.location.date).getMonth() + 1 : 'N/A',
        selectedEvent.location.date ? new Date(selectedEvent.location.date).getDate() : 'N/A',
        selectedEvent.location.date ? new Date(selectedEvent.location.date).getFullYear() : 'N/A',
        selectedEvent.location.gear || 'N/A',
        set.set_id || 'N/A',
        set.location?.start_utm_e || 'N/A',
        set.location?.end_utm_n || 'N/A',
        selectedEvent.location.location || 'N/A',
        set.effort_time_sec || 'N/A',
        selectedEvent.environmental.cond || 'N/A',
        selectedEvent.environmental.pH || 'N/A',
        selectedEvent.environmental.tdS || 'N/A',
        selectedEvent.environmental.salts || 'N/A',
        selectedEvent.environmental.temp_water_c || 'N/A',
        set.amps || selectedEvent.environmental.amps || 'N/A'
      ];
      fullData.push(headers);
      fullData.push(transectData);
      fullData.push(fishHeader);

      const fishData = (set.fish || []).map(fish => [
        fish.spp || 'N/A',
        fish.length || '',
        fish.weight || '',
        fish.stomach_content || '',
        fish.notes || ''
      ]);
      fullData.push(...fishData);
      fullData.push([]);
    });

    exportToExcel(fullData, filename, format);
  };

  const exportCatchSummary = (format = 'xlsx') => {
    if (!selectedEvent || !selectedEvent.is_finalized) return;
    const lakeName = selectedEvent.location.lake?.replace(/\s+/g, '_') || 'UnknownLake';
    const eventDate = selectedEvent.location.date?.replace(/-/g, '') || 'UnknownDate';
    const filename = `${lakeName}_${eventDate}_CatchSummary`;
    const data = [
      ['Species', 'Number', 'Number (%)', 'Biomass (kg)', 'Biomass (%)'],
      ...catchSummary().map(row => [
        row.species, row.number, row.numberPercent, row.biomass, row.biomassPercent
      ])
    ];
    exportToExcel(data, filename, format);
  };

  const exportAbundanceCondition = (format = 'xlsx') => {
    if (!selectedEvent || !selectedEvent.is_finalized) return;
    const lakeName = selectedEvent.location.lake?.replace(/\s+/g, '_') || 'UnknownLake';
    const eventDate = selectedEvent.location.date?.replace(/-/g, '') || 'UnknownDate';
    const filename = `${lakeName}_${eventDate}_AbundanceCondition`;
    const data = [
      ['Species', 'CPUE', 'Mean TL', 'Range TL', 'Mean WT', 'Range WT', 'Mean Wr'],
      ...(selectedEvent.abundance_condition || []).map(row => [
        row.species, row.cpue, row.meanTL, row.rangeTL, row.meanWT, row.rangeWT, row.meanWr
      ])
    ];
    exportToExcel(data, filename, format);
  };

  const catchSummary = () => {
    if (!selectedEvent || !selectedEvent.sets || !selectedEvent.is_finalized) return [];
    const speciesData = {};
    selectedEvent.sets.forEach(set => {
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

  const histogramData = () => {
    if (!selectedEvent || !selectedEvent.is_finalized || !selectedEvent.sets || !selectedSpecies) return null;

    const lengths = selectedEvent.sets
      .flatMap(set => set.fish || [])
      .filter(fish => fish.spp === selectedSpecies && fish.length !== null && !isNaN(fish.length))
      .map(fish => fish.length / 25.4);

    if (lengths.length === 0) return null;

    const minLength = Math.floor(Math.min(...lengths)) - 1;
    const maxLength = Math.ceil(Math.max(...lengths)) + 1;
    const bins = Array.from({ length: maxLength - minLength + 1 }, (_, i) => minLength + i);

    const histogramData = Array(bins.length - 1).fill(0);
    lengths.forEach(length => {
      const binIndex = Math.min(Math.floor(length - minLength), bins.length - 2);
      histogramData[binIndex]++;
    });

    const speciesMetrics = speciesData[selectedSpecies];
    if (!speciesMetrics || !speciesMetrics.psd_s) return null;

    const stockLength = speciesMetrics.psd_s / 25.4;
    const qualityLength = speciesMetrics.psd_q / 25.4;
    const preferredLength = speciesMetrics.psd_p / 25.4;
    const memorableLength = speciesMetrics.psd_m / 25.4;
    const trophyLength = speciesMetrics.psd_t / 25.4;

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
                type: 'line',
                xMin: stockLength,
                xMax: stockLength,
                borderColor: '#006666',
                borderWidth: 1.5,
                borderDash: [5, 5],
                label: {
                  content: 'S',
                  position: 'top',
                  yAdjust: -20,
                  enabled: true,
                  font: { weight: 'bold', color: '#006666' }
                }
              },
              {
                type: 'line',
                xMin: qualityLength,
                xMax: qualityLength,
                borderColor: '#006666',
                borderWidth: 1.5,
                borderDash: [5, 5],
                label: {
                  content: 'Q',
                  position: 'top',
                  yAdjust: -20,
                  enabled: true,
                  font: { weight: 'bold', color: '#006666' }
                }
              },
              {
                type: 'line',
                xMin: preferredLength,
                xMax: preferredLength,
                borderColor: '#006666',
                borderWidth: 1.5,
                borderDash: [5, 5],
                label: {
                  content: 'P',
                  position: 'top',
                  yAdjust: -20,
                  enabled: true,
                  font: { weight: 'bold', color: '#006666' }
                }
              },
              {
                type: 'line',
                xMin: memorableLength,
                xMax: memorableLength,
                borderColor: '#006666',
                borderWidth: 1.5,
                borderDash: [5, 5],
                label: {
                  content: 'M',
                  position: 'top',
                  yAdjust: -20,
                  enabled: true,
                  font: { weight: 'bold', color: '#006666' }
                }
              },
              {
                type: 'line',
                xMin: trophyLength,
                xMax: trophyLength,
                borderColor: '#006666',
                borderWidth: 1.5,
                borderDash: [5, 5],
                label: {
                  content: 'T',
                  position: 'top',
                  yAdjust: -20,
                  enabled: true,
                  font: { weight: 'bold', color: '#006666' }
                }
              },
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

  const pieChartData = () => {
    if (!selectedEvent || !selectedEvent.is_finalized || !selectedEvent.sets) return null;

    const stomachContents = selectedEvent.sets
      .flatMap(set => set.fish || [])
      .reduce((acc, fish) => {
        const content = fish.stomach_content || 'Unknown';
        acc[content] = (acc[content] || 0) + 1;
        return acc;
      }, {});

    return {
      labels: Object.keys(stomachContents),
      datasets: [{
        data: Object.values(stomachContents),
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'],
        hoverOffset: 4
      }],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Diet Composition', padding: 15, color: '#008080' }
        }
      }
    };
  };

  const exportHistogramImage = () => {
    if (!chartRef.current) return;
    const image = chartRef.current.toBase64Image();
    const byteString = atob(image.split(',')[1]);
    const mimeString = image.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });
    saveAs(blob, `length_frequency_histogram_${selectedSpecies}.png`);
  };

  const exportPieChartImage = () => {
    if (!pieChartRef.current) return;
    const image = pieChartRef.current.toBase64Image();
    const byteString = atob(image.split(',')[1]);
    const mimeString = image.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });
    saveAs(blob, `diet_composition_pie_chart_${selectedEvent.location.lake}_${selectedEvent.location.date}.png`);
  };

  const speciesOptions = [...new Set(selectedEvent && selectedEvent.sets ? selectedEvent.sets.flatMap(set => set.fish.map(fish => fish.spp)).filter(Boolean) : [])];

  const renderCurrentSeasonDashboard = () => (
    <div className="dashboard">
      <h3>Current Season Events</h3>
      {pastEvents.length === 0 ? (
        <p>No events for the current season.</p>
      ) : (
        <ul>
          {pastEvents.map((event, index) => (
            <li key={index}>
              {event.location?.lake} - {event.location?.date}
              <button onClick={() => { setSelectedEvent(event); onSelect(event); }}>Select</button>
              {!event.synced && <button onClick={() => handleSendToFirebase(event, index)}>Sync</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const renderPastYearsDashboard = () => (
    <div className="dashboard">
      <h3>Past Years Data</h3>
      {years.map(year => (
        <div key={year}>
          <h4>{year}</h4>
          <button onClick={() => fetchEventsByYear(year)}>
            {expandedYears[year] ? 'Hide' : 'View'} {year} Events
          </button>
          {expandedYears[year] && yearEvents[year] && (
            <ul>
              {yearEvents[year].map((event, index) => (
                <li key={index}>
                  {event.location?.lake} - {event.location?.date}
                  <button onClick={() => { setSelectedEvent(event); onSelect(event); }}>Select</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );

  const renderSamplingDataDashboard = () => (
    <div className="dashboard">
      <h3>Sampling Data</h3>
      <h4>Environmental Data</h4>
      <table>
        <thead>
          <tr>
            <th>pH</th><th>Temp (°C)</th><th>Cond</th><th>tdS</th><th>Salts</th><th>AMPS</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{selectedEvent.environmental.pH || 'N/A'}</td>
            <td>{selectedEvent.environmental.temp_water_c || 'N/A'}</td>
            <td>{selectedEvent.environmental.cond || 'N/A'}</td>
            <td>{selectedEvent.environmental.tdS || 'N/A'}</td>
            <td>{selectedEvent.environmental.salts || 'N/A'}</td>
            <td>{selectedEvent.environmental.amps || 'N/A'}</td>
          </tr>
        </tbody>
      </table>
      <h4>Raw Fish Summary</h4>
      {catchSummary().length === 0 ? (
        <p>No fish data available for summary.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Species</th><th>Number</th><th>Number (%)</th><th>Biomass (kg)</th><th>Biomass (%)</th>
            </tr>
          </thead>
          <tbody>
            {catchSummary().map(row => (
              <tr key={row.species}>
                <td>{row.species}</td><td>{row.number}</td><td>{row.numberPercent}</td>
                <td>{row.biomass}</td><td>{row.biomassPercent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h4>Sets</h4>
      {selectedEvent.sets.map(set => (
        <div key={set.set_id}>
          <h5>{selectedEvent.gear_type === 'electrofishing' ? `Transect #${set.set_id}` : `Net #${set.set_id}`} 
            {set.type === 'net_set' && !set.pull_datetime && <span className="pending-label"> (Pending)</span>}
          </h5>
          <p>Effort/Soak Time: {set.effort_time_hours || set.soak_time_hours || 'N/A'} hours</p>
          <p>Location: UTM_E={set.location.start_utm_e}, UTM_N={set.location.end_utm_n}</p>
          <p>CPUE: {set.cpue || 'N/A'}</p>
          <table>
            <thead>
              <tr>
                <th>Species</th><th>Length (mm)</th><th>Weight (g)</th><th>Stomach Content</th><th>Sex</th><th>Fats</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {set.fish.map((fish, index) => (
                <tr key={index}>
                  <td>{fish.spp}</td><td>{fish.length}</td><td>{fish.weight}</td><td>{fish.stomach_content}</td>
                  <td>{fish.sex}</td><td>{fish.fats}</td><td>{fish.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );

  const renderLengthFrequencyDashboard = () => (
    <div className="dashboard">
      <h3>Length Frequency</h3>
      {selectedEvent.is_finalized ? (
        <>
          <select value={selectedSpecies} onChange={(e) => setSelectedSpecies(e.target.value)}>
            <option value="">Select Species</option>
            {speciesOptions.map(spp => (
              <option key={spp} value={spp}>{spp}</option>
            ))}
          </select>
          {selectedSpecies && histogramData() ? (
            <>
              <Bar
                ref={chartRef}
                data={{
                  labels: histogramData().labels,
                  datasets: histogramData().datasets
                }}
                options={histogramData().options}
                height={400}
              />
              <button onClick={exportHistogramImage}>Export Histogram Image</button>
            </>
          ) : (
            <p>Please select a species to view the length frequency histogram.</p>
          )}
        </>
      ) : (
        <p>Event must be finalized to view length frequency data.</p>
      )}
    </div>
  );

  const renderCatchSummaryDashboard = () => (
    <div className="dashboard">
      <h3>Catch Summary</h3>
      {selectedEvent.is_finalized ? (
        <>
          {catchSummary().length === 0 ? (
            <p>No fish data available for Catch Summary.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Species</th><th>Number</th><th>Number (%)</th><th>Biomass (kg)</th><th>Biomass (%)</th>
                </tr>
              </thead>
              <tbody>
                {catchSummary().map(row => (
                  <tr key={row.species}>
                    <td>{row.species}</td><td>{row.number}</td><td>{row.numberPercent}</td>
                    <td>{row.biomass}</td><td>{row.biomassPercent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h4>Diet Composition</h4>
          {pieChartData() ? (
            <div>
              <Pie
                ref={pieChartRef}
                data={pieChartData()}
                options={pieChartData().options}
                height={400}
              />
              <button onClick={exportPieChartImage}>Export Pie Chart Image</button>
            </div>
          ) : (
            <p>No diet data available. Ensure fish have stomach content recorded.</p>
          )}
          <h4>Event Metrics</h4>
          <p>Total Fish: {selectedEvent.event_metrics?.total_fish || selectedEvent.sets.reduce((sum, set) => sum + (set.fish ? set.fish.length : 0), 0)}</p>
          <p>Total Effort/Soak Time: {(selectedEvent.event_metrics?.total_effort_or_soak_hours || selectedEvent.sets.reduce((sum, set) => sum + (Number(set.effort_time_hours || set.soak_time_hours) || 0), 0) || 0).toFixed(2)} hours</p>
          <p>Event CPUE: {selectedEvent.event_metrics?.cpue || 'N/A'}</p>
        </>
      ) : (
        <p>Event must be finalized to view catch summary data.</p>
      )}
    </div>
  );

  return (
    <div className="past-events">
      <h2>NER Sportfish Data - Past Events</h2>
      {!selectedEvent ? (
        <div className="dashboard-container">
          {renderCurrentSeasonDashboard()}
          {renderPastYearsDashboard()}
        </div>
      ) : (
        <div className="dashboard-container">
          <h2>{`${selectedEvent.location?.lake} ${selectedEvent.location?.date} - ${selectedEvent.location?.gear}`}</h2>
          <div className="button-group">
            <button onClick={() => exportFullDataset('xlsx')}>Export XLSX</button>
            <button onClick={() => exportFullDataset('xls')}>Export XLS</button>
            <button onClick={() => exportCatchSummary('xlsx')}>Export Catch Summary</button>
            <button onClick={() => exportAbundanceCondition('xlsx')}>Export Abundance & Condition</button>
            <button onClick={() => setSelectedEvent(null)}>Back to Past Events</button>
          </div>
          {renderSamplingDataDashboard()}
          {renderLengthFrequencyDashboard()}
          {renderCatchSummaryDashboard()}
        </div>
      )}
    </div>
  );
}

export default PastEvents;