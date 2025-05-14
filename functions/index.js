const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const { Document, Packer, Paragraph, Table, TableRow, TableCell } = require('docx');
const PDFDocument = require('pdfkit');

// Initialize Firebase Admin SDK
admin.initializeApp();

// Cloud Function to generate Word (.docx) or PDF report
exports.generateReport = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const data = req.body;
      const format = req.query.format || 'docx';

      // Build Word document
      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({ text: 'Monitoring Report (NER)', heading: 'Title' }),
            new Paragraph(`Water: ${data.reservoir}    Date(s): ${data.dates}`),
            new Paragraph(`Stocking Strategy: ${data.stockingStrategy}`),
            new Paragraph(`Target Species: (${data.methods.targetSpecies.join(', ')})`),
            new Paragraph(''),
            new Paragraph({ text: 'Methods Description', heading: 'Heading2' }),
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph('Gear Type')] }),
                    new TableCell({ children: [new Paragraph('Effort')] }),
                    new TableCell({ children: [new Paragraph('Water Temp (°F)')] }),
                    new TableCell({ children: [new Paragraph('Additional Data Collected')] }),
                  ]
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph(data.methods.gear)] }),
                    new TableCell({ children: [new Paragraph(data.methods.effort)] }),
                    new TableCell({ children: [new Paragraph(data.methods.temp)] }),
                    new TableCell({ children: [new Paragraph(data.methods.notes)] }),
                  ]
                }),
              ]
            }),
            new Paragraph(''),
            new Paragraph({ text: 'Abundance, Condition and Proportional Size Distribution of Target Species', heading: 'Heading2' }),
            new Table({
              rows: [
                new TableRow({
                  children: ['Species','CPUE','Mean TL','Range TL','Mean Wr','PSD','PSD-P','PSD-M','PSD-T']
                    .map(text => new TableCell({ children: [new Paragraph(text)] }))
                }),
                ...data.abundanceTable.map(row => new TableRow({
                  children: [
                    row.species,
                    row.cpue,
                    row.meanTL,
                    row.rangeTL,
                    row.meanWr,
                    row.psd,
                    row.psdP,
                    row.psdM,
                    row.psdT
                  ].map(val => new TableCell({ children: [new Paragraph(String(val))] }))
                }))
              ]
            }),
            new Paragraph(''),
            new Paragraph({ text: 'Catch Summary', heading: 'Heading2' }),
            new Table({
              rows: [
                new TableRow({
                  children: ['Species','Number','% Number','Biomass (kg)','% Biomass']
                    .map(text => new TableCell({ children: [new Paragraph(text)] }))
                }),
                ...data.catchSummary.map(row => new TableRow({
                  children: [
                    row.species,
                    row.number,
                    row.pctNumber,
                    row.biomass,
                    row.pctBiomass
                  ].map(val => new TableCell({ children: [new Paragraph(String(val))] }))
                }))
              ]
            }),
            new Paragraph(''),
            new Paragraph({ text: 'Comments:', heading: 'Heading2' }),
            new Paragraph(data.comments),
            new Paragraph(''),
            new Paragraph({ text: 'Suggested Management Changes:', heading: 'Heading2' }),
            new Paragraph(data.suggestions),
          ]
        }]
      });

      if (format === 'pdf') {
        // Generate PDF version
        const pdfDoc = new PDFDocument({ margin: 40 });
        res.setHeader('Content-Type','application/pdf');
        res.setHeader('Content-Disposition',`attachment; filename=${data.reservoir.replace(/\s+/g,'_')}_Report.pdf`);
        pdfDoc.pipe(res);

        // PDF content
        pdfDoc.fontSize(18).text('Monitoring Report (NER)', { align: 'center' });
        pdfDoc.moveDown();
        pdfDoc.fontSize(12).text(`Water: ${data.reservoir}    Date(s): ${data.dates}`);
        pdfDoc.text(`Stocking Strategy: ${data.stockingStrategy}`);
        pdfDoc.text(`Target Species: (${data.methods.targetSpecies.join(', ')})`);
        pdfDoc.moveDown();
        pdfDoc.fontSize(14).text('Methods Description');
        pdfDoc.fontSize(12).text(`${data.methods.gear} | ${data.methods.effort} | ${data.methods.temp} | ${data.methods.notes}`);
        pdfDoc.moveDown();
        pdfDoc.fontSize(14).text('Abundance, Condition and Proportional Size Distribution of Target Species');
        data.abundanceTable.forEach(r => {
          pdfDoc.fontSize(10).text(
            `${r.species}: CPUE ${r.cpue}, Mean TL ${r.meanTL}, Wr ${r.meanWr}, PSD ${r.psd}`
          );
        });
        pdfDoc.moveDown();
        pdfDoc.fontSize(14).text('Catch Summary');
        data.catchSummary.forEach(r => {
          pdfDoc.fontSize(10).text(
            `${r.species}: #${r.number} (${r.pctNumber}%), Biomass ${r.biomass} kg (${r.pctBiomass}%)`
          );
        });
        pdfDoc.moveDown();
        pdfDoc.fontSize(14).text('Comments');
        pdfDoc.fontSize(12).text(data.comments);
        pdfDoc.moveDown();
        pdfDoc.fontSize(14).text('Suggested Management Changes');
        pdfDoc.fontSize(12).text(data.suggestions);
        pdfDoc.end();
      } else {
        // Generate Word (.docx) buffer
        const buffer = await Packer.toBuffer(doc);
        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition',`attachment; filename=${data.reservoir.replace(/\s+/g,'_')}_Report.docx`);
        res.send(buffer);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      res.status(500).send('Internal Server Error');
    }
  });
});
