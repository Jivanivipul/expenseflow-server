const Transaction = require('../models/Transaction');
const PDFDocument = require('pdfkit');

// Helper: get date range for a period
const getRange = (period, dateStr) => {
  const d = dateStr ? new Date(dateStr) : new Date();
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
    // default: monthly
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return { start, end };
};

// @desc    Get report summary for a period
// @route   GET /api/reports?period=monthly&date=2026-10-31
// @access  Private
const getReport = async (req, res) => {
  try {
    const { period = 'monthly', date } = req.query;
    const { start, end } = getRange(period, date);
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
    const { period = 'monthly', date } = req.query;
    const { start, end } = getRange(period, date);

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
      `attachment; filename="report-${period}-${start.toISOString().slice(0, 10)}.csv"`
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
    const { period = 'monthly', date } = req.query;
    const { start, end } = getRange(period, date);

    const transactions = await Transaction.find({
      user: req.user._id,
      date: { $gte: start, $lt: end },
    }).sort({ date: -1 });

    let income = 0, expense = 0;
    transactions.forEach((t) => {
      if (t.type === 'income') income += t.amount;
      if (t.type === 'expense') expense += t.amount;
    });

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report-${period}-${start.toISOString().slice(0, 10)}.pdf"`
    );

    doc.pipe(res);

    doc.fontSize(20).text('ExpenseFlow Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text(`Period: ${period}`, { align: 'center' });
    doc.text(
      `Range: ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
      { align: 'center' }
    );
    doc.moveDown(1.5);

    doc.fontSize(14).text('Summary', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Total Income:   Rs. ${income}`);
    doc.text(`Total Expenses: Rs. ${expense}`);
    doc.text(`Net Savings:    Rs. ${income - expense}`);
    doc.text(`Transactions:   ${transactions.length}`);
    doc.moveDown(1.5);

    doc.fontSize(14).text('Transactions', { underline: true });
    doc.moveDown(0.5);

    const colX = { date: 50, type: 130, category: 200, amount: 310, method: 400, desc: 490 };
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Date', colX.date, doc.y, { continued: true, width: 80 });
    doc.text('Type', colX.type, doc.y, { continued: true, width: 70 });
    doc.text('Category', colX.category, doc.y, { continued: true, width: 110 });
    doc.text('Amount', colX.amount, doc.y, { continued: true, width: 90 });
    doc.text('Method', colX.method, doc.y, { continued: true, width: 90 });
    doc.text('Description', colX.desc, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica');

    const headerY = doc.y;
    doc.moveTo(50, headerY).lineTo(550, headerY).stroke();
    doc.moveDown(0.3);

    transactions.forEach((t) => {
      const rowY = doc.y;
      const d = t.date.toISOString().slice(0, 10);
      doc.fontSize(9).text(d, colX.date, rowY, { width: 80 });
      doc.text(t.type, colX.type, rowY, { width: 70 });
      doc.text(t.category, colX.category, rowY, { width: 110 });
      doc.text(`${t.amount}`, colX.amount, rowY, { width: 90 });
      doc.text(t.paymentMethod, colX.method, rowY, { width: 90 });
      doc.text(t.description || '-', colX.desc, rowY, { width: 60 });
      doc.moveDown(0.4);
    });

    if (transactions.length === 0) {
      doc.moveDown().fontSize(10).text('No transactions in this period.', { align: 'center' });
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor('gray').text(
      `Generated on ${new Date().toISOString().slice(0, 10)} by ExpenseFlow`,
      { align: 'center' }
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