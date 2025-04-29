import { useState, useRef, useEffect } from 'react';
import { Bar, Pie } from 'react-chartjs-2'; // Added Pie for diet chart
import Chart from 'chart.js/auto';
import { Chart as ChartJS } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import speciesData from './speciesData';

ChartJS.register(annotationPlugin);

function Tables({ currentEvent, onBack, setView }) {
  const [showHistogram, setShowHistogram] = useState(false);
  const [showPieChart, setShowPieChart] = useState(false); // For diet composition
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [activeTab, setActiveTab] = useState('site'); // Site Data, Analyzed Fish Data
  const [isLoading, setIsLoading] = useState(true);
  const chartRef = useRef(null);
  const pieChartRef = useRef(null);

  useEffect(() => {
    if (!currentEvent) {
      setTimeout(() => setView('event'), 100);
    } else if (!currentEvent.location || !currentEvent.sets) {
      setTimeout(() => setView('event'), 100);
    } else {
      setIsLoading(false);
    }
  }, [currentEvent, setView]);

  const exportToExcel = (data, filename, format = 'xlsx') => {
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${filename}.${format}`);
  };

  const exportFullDataset = (format = 'xlsx') => {
    if (!currentEvent || !currentEvent.sets) return;

    const lakeName = currentEvent.location.lake?.replace(/\s+/g, '_') || 'UnknownLake';
    const eventDate = currentEvent.location.date?.replace(/-/g, '') || 'UnknownDate';
    const filename = `${lakeName}_${eventDate}`;

    const headers = [
      'Lake', 'Observers', 'Month', 'Day', 'Year', 'Gear', 'Transect #', 'Start UTM_E', 'End UTM_N', 
      'Location', 'Effort_time (sec)', 'Cond', 'pH', 'tdS', 'Salts', 'Temp_Water_C', 'AMPS'
    ];
    const fishHeader = ['SPP', 'TL_mm', 'WT_g', 'Stomach Content', 'Notes'];
    const fullData = [];

    currentEvent.sets.forEach(set => {
      const transectData = [
        currentEvent.location.lake || 'N/A',
        currentEvent.location.observers || 'N/A',
        currentEvent.location.date ? new Date(currentEvent.location.date).getMonth() + 1 : 'N/A',
        currentEvent.location.date ? new Date(currentEvent.location.date).getDate() : 'N/A',
        currentEvent.location.date ? new Date(currentEvent.location.date).getFullYear() : 'N/A',
        currentEvent.location.gear || 'N/A',
        set.set_id || 'N/A',
        set.location?.start_utm_e || 'N/A',
        set.location?.end_utm_n || 'N/A',
        currentEvent.location.location || 'N/A',
        set.effort_time_sec || 'N/A',
        currentEvent.environmental.cond || 'N/A',
        currentEvent.environmental.pH || 'N/A',
        currentEvent.environmental.tdS || 'N/A',
        currentEvent.environmental.salts || 'N/A',
        currentEvent.environmental.temp_water_c || 'N/A',
        set.amps || currentEvent.environmental.amps || 'N/A'
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
      fullData.push([]); // Empty row between transects
    });

    exportToExcel(fullData, filename, format);
  };

  const exportCatchSummary = (format = 'xlsx') => {
    if (!currentEvent || !currentEvent.is_finalized) return;
    const lakeName = currentEvent.location.lake?.replace(/\s+/g, '_') || 'UnknownLake';
    const eventDate = currentEvent.location.date?.replace(/-/g, '') || 'UnknownDate';
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
    if (!currentEvent || !currentEvent.is_finalized) return;
    const lakeName = currentEvent.location.lake?.replace(/\s+/g, '_') || 'UnknownLake';
    const eventDate = currentEvent.location.date?.replace(/-/g, '') || 'UnknownDate';
    const filename = `${lakeName}_${eventDate}_AbundanceCondition`;
    const data = [
      ['Species', 'CPUE', 'Mean TL', 'Range TL', 'Mean WT', 'Range WT', 'Mean Wr'],
      ...(currentEvent.abundance_condition || []).map(row => [
        row.species, row.cpue, row.meanTL, row.rangeTL, row.meanWT, row.rangeWT, row.meanWr
      ])
    ];
    exportToExcel(data, filename, format);
  };

  const catchSummary = () => {
    if (!currentEvent || !currentEvent.sets || !currentEvent.is_finalized) return [];
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

  const histogramData = () => {
    if (!currentEvent || !currentEvent.is_finalized || !currentEvent.sets || !selectedSpecies) return null;

    const lengths = currentEvent.sets
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
    if (!currentEvent || !currentEvent.is_finalized || !currentEvent.sets) return null;

    const stomachContents = currentEvent.sets
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
    saveAs(blob, `diet_composition_pie_chart_${currentEvent.location.lake}_${currentEvent.location.date}.png`);
  };

  const speciesOptions = [...new Set(currentEvent && currentEvent.sets ? currentEvent.sets.flatMap(set => set.fish.map(fish => fish.spp)).filter(Boolean) : [])];

  if (isLoading || !currentEvent || !currentEvent.location) {
    return <div>Loading...</div>;
  }

  return (
    <div className="tables">
      <h2>{currentEvent.location.lake} ({currentEvent.location.date})</h2>
      <div className="button-group">
        <button onClick={onBack}>New Sampling Event</button>
        <button onClick={() => setView('past')}>Back to Past Events</button>
        <button onClick={() => exportFullDataset('xlsx')}>Download XLSX</button>
        <button onClick={() => exportFullDataset('xls')}>Download XLS</button>
        <button onClick={() => exportCatchSummary('xlsx')}>Export Catch Summary</button>
        <button onClick={() => exportAbundanceCondition('xlsx')}>Export Abundance & Condition</button>
      </div>
      <div className="tabs">
        <button className={activeTab === 'site' ? 'active' : ''} onClick={() => setActiveTab('site')}>
          Site Data
        </button>
        <button className={activeTab === 'analyzed' ? 'active' : ''} onClick={() => setActiveTab('analyzed')}>
          Analyzed Fish Data
        </button>
      </div>
      {activeTab === 'site' && (
        <div className="tab-content">
          <h3>Environmental Data</h3>
          <table>
            <thead>
              <tr>
                <th>pH</th><th>Temp (°C)</th><th>Cond</th><th>tdS</th><th>Salts</th><th>AMPS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{currentEvent.environmental.pH || 'N/A'}</td>
                <td>{currentEvent.environmental.temp_water_c || 'N/A'}</td>
                <td>{currentEvent.environmental.cond || 'N/A'}</td>
                <td>{currentEvent.environmental.tdS || 'N/A'}</td>
                <td>{currentEvent.environmental.salts || 'N/A'}</td>
                <td>{currentEvent.environmental.amps || 'N/A'}</td>
              </tr>
            </tbody>
          </table>
          <h3>Raw Fish Summary</h3>
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
          <h3>Sets</h3>
          {currentEvent.sets.map(set => (
            <div key={set.set_id}>
              <h4>{currentEvent.gear_type === 'electrofishing' ? `Transect #${set.set_id}` : `Net #${set.set_id}`} 
                {set.type === 'net_set' && !set.pull_datetime && <span className="pending-label"> (Pending)</span>}
              </h4>
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
      )}
      {activeTab === 'analyzed' && currentEvent.is_finalized && (
        <div className="tab-content">
          <h3>Catch Summary</h3>
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
          <h3>Abundance and Condition</h3>
          <table>
            <thead>
              <tr>
                <th>Species</th><th>CPUE</th><th>Mean TL</th><th>Range TL</th><th>Mean WT</th><th>Range WT</th><th>Mean Wr</th>
              </tr>
            </thead>
            <tbody>
              {(currentEvent.abundance_condition || []).map(row => (
                <tr key={row.species}>
                  <td>{row.species}</td><td>{row.cpue}</td><td>{row.meanTL}</td><td>{row.rangeTL}</td>
                  <td>{row.meanWT}</td><td>{row.rangeWT}</td><td>{row.meanWr}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Length Frequency Histogram</h3>
          <div>
            <select value={selectedSpecies} onChange={(e) => setSelectedSpecies(e.target.value)}>
              <option value="">Select Species</option>
              {speciesOptions.map(spp => (
                <option key={spp} value={spp}>{spp}</option>
              ))}
            </select>
            {selectedSpecies && histogramData() && (
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
            )}
          </div>
          <h3>Diet Composition</h3>
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
            <p>No diet data available.</p>
          )}
          <h3>Event Metrics</h3>
          <p>Total Fish: {currentEvent.event_metrics?.total_fish || currentEvent.sets.reduce((sum, set) => sum + (set.fish ? set.fish.length : 0), 0)}</p>
          <p>Total Effort/Soak Time: {(currentEvent.event_metrics?.total_effort_or_soak_hours || currentEvent.sets.reduce((sum, set) => sum + (Number(set.effort_time_hours || set.soak_time_hours) || 0), 0) || 0).toFixed(2)} hours</p>
          <p>Event CPUE: {currentEvent.event_metrics?.cpue || 'N/A'}</p>
        </div>
      )}
      {showHistogram && (
        <div className="modal">
          <div className="modal-content">
            <h3>Length Frequency Histogram</h3>
            <select value={selectedSpecies} onChange={(e) => setSelectedSpecies(e.target.value)}>
              <option value="">Select Species</option>
              {speciesOptions.map(spp => (
                <option key={spp} value={spp}>{spp}</option>
              ))}
            </select>
            {selectedSpecies && histogramData() && (
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
                <div className="export-buttons">
                  <button onClick={exportHistogramImage}>Download Histogram Image</button>
                </div>
              </>
            )}
            <button onClick={() => setShowHistogram(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Tables;