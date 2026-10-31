const Transaction = require('../models/Transaction');

// @desc    Create a transaction (income or expense)
// @route   POST /api/transactions
// @access  Private
const createTransaction = async (req, res) => {
  try {
    const { type, amount, category, description, paymentMethod, date } = req.body;

    if (!type || !amount || !category) {
      return res.status(400).json({ message: 'type, amount and category are required' });
    }

    const transaction = await Transaction.create({
      user: req.user._id,
      type,
      amount,
      category,
      description,
      paymentMethod,
      date: date || Date.now(),
    });

    res.status(201).json({ message: 'Transaction created', transaction });
  } catch (error) {
    console.error('createTransaction error:', error);
    res.status(500).json({ message: 'Server error creating transaction' });
  }
};

// @desc    Get all transactions for logged-in user (with filters)
// @route   GET /api/transactions
// @access  Private
const getTransactions = async (req, res) => {
  try {
    const { type, category, from, to, search, limit = 100 } = req.query;
    const query = { user: req.user._id };

    if (type) query.type = type;
    if (category) query.category = category;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    if (search) {
      query.description = { $regex: search, $options: 'i' };
    }

    const transactions = await Transaction.find(query)
      .sort({ date: -1 })
      .limit(parseInt(limit));

    res.json({ count: transactions.length, transactions });
  } catch (error) {
    console.error('getTransactions error:', error);
    res.status(500).json({ message: 'Server error fetching transactions' });
  }
};

// @desc    Update a transaction
// @route   PUT /api/transactions/:id
// @access  Private
const updateTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const fields = ['type', 'amount', 'category', 'description', 'paymentMethod', 'date'];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) transaction[f] = req.body[f];
    });

    await transaction.save();
    res.json({ message: 'Transaction updated', transaction });
  } catch (error) {
    console.error('updateTransaction error:', error);
    res.status(500).json({ message: 'Server error updating transaction' });
  }
};

// @desc    Delete a transaction
// @route   DELETE /api/transactions/:id
// @access  Private
const deleteTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.json({ message: 'Transaction deleted', transaction });
  } catch (error) {
    console.error('deleteTransaction error:', error);
    res.status(500).json({ message: 'Server error deleting transaction' });
  }
};

module.exports = {
  createTransaction,
  getTransactions,
  updateTransaction,
  deleteTransaction,
};