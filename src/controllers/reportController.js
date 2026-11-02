const Transaction = require('../models/Transaction');
const PDFDocument = require('pdfkit');

// Helper: get date range for a period
const getRange = (query) => {
  const { period, date, from, to } = query;

  // Custom range: both from and to provided
  if (from && to) {
    const start = new Date(from);
    const end = new Date(to);
    end.setDate(end.getDate() + 1); // make "to" inclusive (whole day)
    return { start, end, mode: 'custom' };
  }

  // Preset: derive from period + date
  const d = date ? new Date(date) : new Date();
  let start, end;

  if (period === 'daily') {
    start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  } else if (period === 'weekly') {
    const day = d.getDay();
    const diffToMonday = (day + 6) % 7;
    start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMonday);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  } else if (period === 'yearly') {
    start = new Date(d.getFullYear(), 0, 1);
    end = new Date(d.getFullYear() + 1, 0, 1);
  } else {
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }

  return { start, end, mode: period || 'monthly' };
};

// @desc    Get report summary for a period
// @route   GET /api/reports?period=monthly&date=2026-10-31
// @access  Private
const getReport = async (req, res) => {
  try {
    const { start, end, mode } = getRange(req.query);
    const period = mode;
    const userId = req.user._id;

    const totals = await Transaction.aggregate([
      { $match: { user: userId, date: { $gte: start, $lt: end } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]);
    let income = 0, expense = 0;
    totals.forEach((t) => {
      if (t._id === 'income') income = t.total;
      if (t._id === 'expense') expense = t.total;
    });

    const categories = await Transaction.aggregate([
      { $match: { user: userId, type: 'expense', date: { $gte: start, $lt: end } } },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
      { $project: { _id: 0, category: '$_id', total: 1 } },
    ]);

    const spanMs = end - start;
    const prevStart = new Date(start.getTime() - spanMs);
    const prevTotals = await Transaction.aggregate([
      { $match: { user: userId, type: 'expense', date: { $gte: prevStart, $lt: start } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const prevExpense = prevTotals[0]?.total || 0;
    const change = prevExpense > 0
      ? Math.round(((expense - prevExpense) / prevExpense) * 100)
      : 0;

    const transactions = await Transaction.find({
      user: userId,
      date: { $gte: start, $lt: end },
    }).sort({ date: -1 });

    res.json({
      period,
      range: { start, end },
      income,
      expense,
      savings: income - expense,
      categories,
      previousPeriodExpense: prevExpense,
      changePercent: change,
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    console.error('getReport error:', error);
    res.status(500).json({ message: 'Server error building report' });
  }
};

// @desc    Export report as CSV
// @route   GET /api/reports/export?period=monthly&date=2026-10-31
// @access  Private
const exportCSV = async (req, res) => {
  try {
    const { start, end, mode } = getRange(req.query);
    const period = mode;

    const transactions = await Transaction.find({
      user: req.user._id,
      date: { $gte: start, $lt: end },
    }).sort({ date: -1 });

    const header = 'Date,Type,Category,Amount,Payment Method,Description\n';
    const rows = transactions
      .map((t) => {
        const d = t.date.toISOString().slice(0, 10);
        const desc = `"${(t.description || '').replace(/"/g, '""')}"`;
        return `${d},${t.type},${t.category},${t.amount},${t.paymentMethod},${desc}`;
      })
      .join('\n');

    const csv = header + rows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report-${start.toISOString().slice(0, 10)}_to_${end.toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error('exportCSV error:', error);
    res.status(500).json({ message: 'Server error exporting CSV' });
  }
};

// @desc    Export report as PDF
// @route   GET /api/reports/export-pdf?period=monthly&date=2026-10-31
// @access  Private
const exportPDF = async (req, res) => {
  try {
    const { start, end, mode } = getRange(req.query);
    const period = mode;

    const transactions = await Transaction.find({
      user: req.user._id,
      date: { $gte: start, $lt: end },
    }).sort({ date: -1 });

    let income = 0, expense = 0;
    transactions.forEach((t) => {
      if (t.type === 'income') income += t.amount;
      if (t.type === 'expense') expense += t.amount;
    });

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report-${start.toISOString().slice(0, 10)}_to_${end.toISOString().slice(0, 10)}.pdf"`
    );
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const leftX = 40;
    const rightX = pageWidth - 40;
    const contentWidth = rightX - leftX;

    // Title
    doc.font('Helvetica-Bold').fontSize(22).text('ExpenseFlow Report', { align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(12).fillColor('#555')
      .text(`${period.charAt(0).toUpperCase() + period.slice(1)} report`, { align: 'center' });
    doc.text(
      `${start.toISOString().slice(0, 10)} to ${new Date(end.getTime() - 86400000).toISOString().slice(0, 10)}`,
      { align: 'center' }
    );
    doc.fillColor('#000');
    doc.moveDown(1.2);

    // Summary box
    const summaryY = doc.y;
    const boxH = 90;
    doc.rect(leftX, summaryY, contentWidth, boxH).stroke('#ddd');
    doc.font('Helvetica-Bold').fontSize(14).text('Summary', leftX + 12, summaryY + 10);

    const colW = contentWidth / 4;
    const labels = ['Income', 'Expenses', 'Net Savings', 'Transactions'];
    const values = [
      `Rs. ${income.toLocaleString('en-IN')}`,
      `Rs. ${expense.toLocaleString('en-IN')}`,
      `Rs. ${(income - expense).toLocaleString('en-IN')}`,
      `${transactions.length}`,
    ];
    labels.forEach((label, i) => {
      const x = leftX + 12 + colW * i;
      doc.font('Helvetica').fontSize(10).fillColor('#666').text(label, x, summaryY + 32);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(values[i], x, summaryY + 48);
    });

    doc.y = summaryY + boxH + 20;
    doc.x = leftX;

    // Table header
    doc.font('Helvetica-Bold').fontSize(14).text('Transactions', leftX, doc.y);
    doc.moveDown(0.5);

    // Column widths
    const cols = [
      { label: 'Date', width: 70 },
      { label: 'Type', width: 55 },
      { label: 'Category', width: 90 },
      { label: 'Method', width: 70 },
      { label: 'Amount', width: 80, align: 'right' },
      { label: 'Description', width: contentWidth - 70 - 55 - 90 - 70 - 80, align: 'left' },
    ];

    const drawHeader = (y) => {
      let x = leftX;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
      cols.forEach((c) => {
        doc.text(c.label, x, y, {
          width: c.width,
          align: c.align || 'left',
          lineBreak: false,
        });
        x += c.width;
      });
      doc.moveTo(leftX, y + 14).lineTo(rightX, y + 14).stroke('#000');
      return y + 20;
    };

    let rowY = drawHeader(doc.y);

    if (transactions.length === 0) {
      doc.font('Helvetica').fontSize(11).fillColor('#666')
        .text('No transactions in this period.', leftX, rowY, { width: contentWidth, align: 'center' });
    } else {
      transactions.forEach((t, i) => {
        // New page if we're near the bottom
        if (rowY > doc.page.height - 80) {
          doc.addPage();
          rowY = drawHeader(50);
        }

        const row = [
          new Date(t.date).toISOString().slice(0, 10),
          t.type === 'income' ? '+' : '-',
          t.category,
          t.paymentMethod,
          `${t.type === 'income' ? '+' : '-'}${t.amount.toLocaleString('en-IN')}`,
          t.description || '-',
        ];

        const rowH = 16;
        // zebra
        if (i % 2 === 0) {
          doc.rect(leftX, rowY - 2, contentWidth, rowH).fill('#f7f7f7');
        }

        let x = leftX;
        doc.font('Helvetica').fontSize(10).fillColor('#000');
        cols.forEach((c, ci) => {
          let val = row[ci];
          if (ci === 1) val = t.type; // show 'income'/'expense' text instead of +/-
          doc.text(val, x, rowY, {
            width: c.width,
            align: c.align || 'left',
            lineBreak: false,
            ellipsis: true,
          });
          x += c.width;
        });
        rowY += rowH;
      });
    }

    // Footer
    doc.fontSize(9).fillColor('#888').text(
      `Generated on ${new Date().toISOString().slice(0, 10)} by ExpenseFlow`,
      leftX,
      doc.page.height - 50,
      { width: contentWidth, align: 'center' }
    );

    doc.end();
  } catch (error) {
    console.error('exportPDF error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error exporting PDF' });
    }
  }
};

module.exports = { getReport, exportCSV, exportPDF };