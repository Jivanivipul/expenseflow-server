const Debt = require('../models/Debt');

const createDebt = async (req, res) => {
    try {
        const { direction, personName, amount, date, note, dueDate } = req.body;
        if (!direction || !personName || !amount) {
            return res.status(400).json({ message: 'direction, personName, amount required' });
        }
        const debt = await Debt.create({
            user: req.user._id,
            direction,
            personName,
            amount,
            date: date || Date.now(),
            note,
            dueDate,
        });
        res.status(201).json({ message: 'Debt recorded', debt });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
};

const getDebts = async (req, res) => {
    try {
        const { status, direction } = req.query;
        const query = { user: req.user._id };
        if (status) query.status = status;
        if (direction) query.direction = direction;
        const debts = await Debt.find(query).sort({ date: -1 });
        res.json({ count: debts.length, debts });
    } catch (e) {
        res.status(500).json({ message: 'Server error' });
    }
};

const settleDebt = async (req, res) => {
    try {
        const debt = await Debt.findOne({ _id: req.params.id, user: req.user._id });
        if (!debt) return res.status(404).json({ message: 'Not found' });
        debt.status = 'settled';
        debt.settledDate = new Date();
        await debt.save();
        res.json({ message: 'Marked as settled', debt });
    } catch (e) {
        res.status(500).json({ message: 'Server error' });
    }
};

const deleteDebt = async (req, res) => {
    try {
        const debt = await Debt.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!debt) return res.status(404).json({ message: 'Not found' });
        res.json({ message: 'Deleted', debt });
    } catch (e) {
        res.status(500).json({ message: 'Server error' });
    }
};

const getDebtSummary = async (req, res) => {
    try {
        const debts = await Debt.find({ user: req.user._id, status: 'pending' });
        let lent = 0;
        let borrowed = 0;
        debts.forEach((d) => {
            if (d.direction === 'lent') lent += d.amount;
            if (d.direction === 'borrowed') borrowed += d.amount;
        });
        res.json({
            totalLent: lent,
            totalBorrowed: borrowed,
            net: lent - borrowed,
            pendingCount: debts.length,
        });
    } catch (e) {
        res.status(500).json({ message: 'Server error' });
    }
};

const updateDebt = async (req, res) => {
    try {
        const debt = await Debt.findOne({ _id: req.params.id, user: req.user._id });
        if (!debt) return res.status(404).json({ message: 'Debt not found' });

        const fields = ['direction', 'personName', 'amount', 'date', 'dueDate', 'note'];
        fields.forEach((f) => {
            if (req.body[f] !== undefined && req.body[f] !== '') {
                debt[f] = req.body[f];
            }
        });

        await debt.save();
        res.json({ message: 'Debt updated', debt });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error updating debt' });
    }
};


module.exports = { createDebt, getDebts, updateDebt, settleDebt, deleteDebt, getDebtSummary };