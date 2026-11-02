const Transaction = require('../models/Transaction');
const { buildExpenseReport } = require('../utils/expenseReportPdf');

const getRange = (query) => {
  const { period, date, from, to } = query;

  if (from && to) {
    const start = new Date(from);
    const end = new Date(to);
    end.setDate(end.getDate() + 1);
    return { start, end, mode: 'custom' };
  }

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
    const change = prevExpense > 0 ? Math.round(((expense - prevExpense) / prevExpense) * 100) : 0;

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

const exportCSV = async (req, res) => {
  try {
    const { start, end } = getRange(req.query);

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

    buildExpenseReport(res, { period, start, end, income, expense, transactions });
  } catch (error) {
    console.error('exportPDF error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error exporting PDF' });
    }
  }
};

module.exports = { getReport, exportCSV, exportPDF };