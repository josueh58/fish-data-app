import { useEffect, useState } from 'react';
import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';

function Visualizations() {
  const [catchSummary, setCatchSummary] = useState([]);
  const [abundanceCondition, setAbundanceCondition] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const querySnapshot = await getDocs(collection(db, 'entries'));
      const data = querySnapshot.docs.map(doc => doc.data());

      // Catch Summary
      const speciesData = {};
      data.forEach(entry => {
        if (!entry.spp) return;
        if (!speciesData[entry.spp]) {
          speciesData[entry.spp] = { count: 0, biomass: 0 };
        }
        speciesData[entry.spp].count += 1;
        speciesData[entry.spp].biomass += entry.wt_g || 0;
      });

      const totalCount = Object.values(speciesData).reduce((sum, d) => sum + d.count, 0);
      const totalBiomass = Object.values(speciesData).reduce((sum, d) => sum + d.biomass, 0);

      const summaryData = Object.keys(speciesData).map(spp => ({
        species: spp,
        number: speciesData[spp].count,
        numberPercent: ((speciesData[spp].count / totalCount) * 100).toFixed(1),
        biomass: (speciesData[spp].biomass / 1000).toFixed(2), // g to kg
        biomassPercent: ((speciesData[spp].biomass / totalBiomass) * 100).toFixed(1),
      }));
      setCatchSummary(summaryData);

      // Abundance and Condition (simplified)
      const speciesStats = {};
      data.forEach(entry => {
        if (!entry.spp) return;
        if (!speciesStats[entry.spp]) {
          speciesStats[entry.spp] = { tl: [], wt: [], effort: 0 };
        }
        if (entry.tl_mm) speciesStats[entry.spp].tl.push(entry.tl_mm);
        if (entry.wt_g) speciesStats[entry.spp].wt.push(entry.wt_g);
        speciesStats[entry.spp].effort += entry.effort_time_sec || 0;
      });

      const abundanceData = Object.keys(speciesStats).map(spp => {
        const tl = speciesStats[spp].tl;
        const wt = speciesStats[spp].wt;
        const meanTL = tl.length ? (tl.reduce((a, b) => a + b, 0) / tl.length).toFixed(1) : 0;
        const meanWT = wt.length ? (wt.reduce((a, b) => a + b, 0) / wt.length).toFixed(1) : 0;
        return {
          species: spp,
          cpue: speciesStats[spp].effort ? (tl.length / (speciesStats[spp].effort / 3600)).toFixed(2) : 0,
          meanTL,
          rangeTL: tl.length ? `${Math.min(...tl)}-${Math.max(...tl)}` : '-',
          meanWT,
          rangeWT: wt.length ? `${Math.min(...wt)}-${Math.max(...wt)}` : '-',
        };
      });
      setAbundanceCondition(abundanceData);
    };
    fetchData();
  }, []);

  return (
    <div>
      <h2>Catch Summary</h2>
      <table>
        <thead>
          <tr>
            <th>Species</th><th>Number</th><th>Number (%)</th><th>Biomass (kg)</th><th>Biomass (%)</th>
          </tr>
        </thead>
        <tbody>
          {catchSummary.map(row => (
            <tr key={row.species}>
              <td>{row.species}</td><td>{row.number}</td><td>{row.numberPercent}</td>
              <td>{row.biomass}</td><td>{row.biomassPercent}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Abundance and Condition</h2>
      <table>
        <thead>
          <tr>
            <th>Species</th><th>CPUE</th><th>Mean TL</th><th>Range TL</th><th>Mean WT</th><th>Range WT</th>
          </tr>
        </thead>
        <tbody>
          {abundanceCondition.map(row => (
            <tr key={row.species}>
              <td>{row.species}</td><td>{row.cpue}</td><td>{row.meanTL}</td><td>{row.rangeTL}</td>
              <td>{row.meanWT}</td><td>{row.rangeWT}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Visualizations;