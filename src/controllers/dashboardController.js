const Transaction = require('../models/Transaction');

// @desc    Get dashboard summary for logged-in user
// @route   GET /api/dashboard/summary
// @access  Private
const getSummary = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Totals (all time)
    const totals = await Transaction.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
        },
      },
    ]);

    let totalIncome = 0;
    let totalExpenses = 0;
    totals.forEach((t) => {
      if (t._id === 'income') totalIncome = t.total;
      if (t._id === 'expense') totalExpenses = t.total;
    });
    const balance = totalIncome - totalExpenses;

    // 2. Monthly savings (current month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const monthly = await Transaction.aggregate([
      {
        $match: {
          user: userId,
          date: { $gte: startOfMonth, $lt: startOfNextMonth },
        },
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
        },
      },
    ]);

    let monthIncome = 0;
    let monthExpense = 0;
    monthly.forEach((m) => {
      if (m._id === 'income') monthIncome = m.total;
      if (m._id === 'expense') monthExpense = m.total;
    });
    const monthlySavings = monthIncome - monthExpense;

    // 3. Last 6 months income vs expense (for line/bar chart)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthlyChart = await Transaction.aggregate([
      { $match: { user: userId, date: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            type: '$type',
          },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // Reshape into { month: "2026-05", income, expense }
    const chartMap = {};
    monthlyChart.forEach((row) => {
      const key = `${row._id.year}-${String(row._id.month).padStart(2, '0')}`;
      if (!chartMap[key]) chartMap[key] = { month: key, income: 0, expense: 0 };
      chartMap[key][row._id.type] = row.total;
    });
    const chartData = Object.values(chartMap).sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    // 4. Category breakdown (expenses only, all time — for pie chart)
    const categoryBreakdown = await Transaction.aggregate([
      { $match: { user: userId, type: 'expense' } },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
        },
      },
      { $sort: { total: -1 } },
      {
        $project: {
          _id: 0,
          category: '$_id',
          total: 1,
        },
      },
    ]);

    // 5. Recent 5 transactions
    const recentTransactions = await Transaction.find({ user: userId })
      .sort({ date: -1 })
      .limit(5);

    res.json({
      totalIncome,
      totalExpenses,
      balance,
      monthlySavings,
      currentMonth: {
        income: monthIncome,
        expense: monthExpense,
        savings: monthlySavings,
      },
      chartData,            // Recharts line/bar chart
      categoryBreakdown,    // Recharts pie chart
      recentTransactions,
    });
  } catch (error) {
    console.error('getSummary error:', error);
    res.status(500).json({ message: 'Server error building dashboard summary' });
  }
};

module.exports = { getSummary };