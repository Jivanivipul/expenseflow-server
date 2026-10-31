const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');

// Helper: get start/end Date for a "YYYY-MM" month string
const getMonthRange = (monthStr) => {
  const [year, month] = monthStr.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
};

// @desc    Create or update a budget
// @route   POST /api/budgets
// @access  Private
const setBudget = async (req, res) => {
  try {
    const { month, category = null, limit } = req.body;

    if (!month || !limit) {
      return res.status(400).json({ message: 'month and limit are required' });
    }

    // Upsert: update if exists, create if not
    const budget = await Budget.findOneAndUpdate(
      { user: req.user._id, month, category },
      { limit },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ message: 'Budget saved', budget });
  } catch (error) {
    console.error('setBudget error:', error);
    res.status(500).json({ message: 'Server error saving budget' });
  }
};

// @desc    Get all budgets for a month, with usage + warning
// @route   GET /api/budgets?month=YYYY-MM
// @access  Private
const getBudgets = async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const { start, end } = getMonthRange(month);

    const budgets = await Budget.find({ user: req.user._id, month });

    // For each budget, calculate how much was spent
    const result = await Promise.all(
      budgets.map(async (b) => {
        const match = {
          user: req.user._id,
          type: 'expense',
          date: { $gte: start, $lt: end },
        };
        if (b.category) match.category = b.category;

        const agg = await Transaction.aggregate([
          { $match: match },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        const spent = agg[0]?.total || 0;
        const remaining = b.limit - spent;
        const percentage = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;

        let status = 'ok';
        if (percentage >= 100) status = 'exceeded';
        else if (percentage >= 80) status = 'warning';

        return {
          _id: b._id,
          month: b.month,
          category: b.category,
          limit: b.limit,
          spent,
          remaining,
          percentage,
          status,          // ok | warning | exceeded
        };
      })
    );

    res.json({ month, budgets: result });
  } catch (error) {
    console.error('getBudgets error:', error);
    res.status(500).json({ message: 'Server error fetching budgets' });
  }
};

// @desc    Delete a budget
// @route   DELETE /api/budgets/:id
// @access  Private
const deleteBudget = async (req, res) => {
  try {
    const budget = await Budget.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!budget) return res.status(404).json({ message: 'Budget not found' });
    res.json({ message: 'Budget deleted', budget });
  } catch (error) {
    console.error('deleteBudget error:', error);
    res.status(500).json({ message: 'Server error deleting budget' });
  }
};

module.exports = { setBudget, getBudgets, deleteBudget };