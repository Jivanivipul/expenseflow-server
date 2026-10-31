const express = require('express');
const router = express.Router();
const {
  createTransaction,
  getTransactions,
  updateTransaction,
  deleteTransaction,
} = require('../controllers/transactionController');
const { protect } = require('../middleware/authMiddleware');

// All transaction routes are protected
router.use(protect);

router.route('/').post(createTransaction).get(getTransactions);
router.route('/:id').put(updateTransaction).delete(deleteTransaction);

module.exports = router;