const Account = require('../models/Account');
const Transaction = require('../models/Transaction');

// @desc    Create account
const createAccount = async (req, res) => {
  try {
    const { name, type, openingBalance, color } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    const account = await Account.create({
      user: req.user._id,
      name: name.trim(),
      type: type || 'cash',
      openingBalance: Number(openingBalance) || 0,
      color: color || '#3b82f6',
    });
    res.status(201).json({ message: 'Account created', account });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ message: 'You already have an account with this name' });
    }
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    List accounts with computed balance
const getAccounts = async (req, res) => {
  try {
    const accounts = await Account.find({ user: req.user._id, archived: false }).sort({ createdAt: 1 });

    // Compute balance for each account
    const accountsWithBalance = await Promise.all(
      accounts.map(async (acc) => {
        const totals = await Transaction.aggregate([
          { $match: { user: req.user._id, account: acc._id } },
          {
            $group: {
              _id: '$type',
              total: { $sum: '$amount' },
            },
          },
        ]);
        let income = 0;
        let expense = 0;
        totals.forEach((t) => {
          if (t._id === 'income') income = t.total;
          if (t._id === 'expense') expense = t.total;
        });
        return {
          _id: acc._id,
          name: acc.name,
          type: acc.type,
          color: acc.color,
          openingBalance: acc.openingBalance,
          balance: acc.openingBalance + income - expense,
          transactionCount: 0, // filled below
        };
      })
    );

    // Count transactions per account
    const counts = await Transaction.aggregate([
      { $match: { user: req.user._id } },
      { $group: { _id: '$account', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach((c) => {
      if (c._id) countMap[c._id.toString()] = c.count;
    });
    accountsWithBalance.forEach((a) => {
      a.transactionCount = countMap[a._id.toString()] || 0;
    });

    // Total across all accounts
    const totalBalance = accountsWithBalance.reduce((sum, a) => sum + a.balance, 0);

    res.json({ count: accountsWithBalance.length, totalBalance, accounts: accountsWithBalance });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update account (name, type, color)
const updateAccount = async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, user: req.user._id });
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const fields = ['name', 'type', 'color', 'openingBalance'];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) account[f] = req.body[f];
    });
    await account.save();
    res.json({ message: 'Account updated', account });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ message: 'Another account already uses this name' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete account (must have 0 transactions)
const deleteAccount = async (req, res) => {
  try {
    const count = await Transaction.countDocuments({
      user: req.user._id,
      account: req.params.id,
    });
    if (count > 0) {
      return res.status(400).json({
        message: `Cannot delete: ${count} transactions use this account. Move or delete them first.`,
      });
    }
    const account = await Account.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!account) return res.status(404).json({ message: 'Account not found' });
    res.json({ message: 'Account deleted', account });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { createAccount, getAccounts, updateAccount, deleteAccount };