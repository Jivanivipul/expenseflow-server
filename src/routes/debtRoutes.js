const express = require('express');
const router = express.Router();
const {
  createDebt,
  getDebts,
  updateDebt,
  settleDebt,
  deleteDebt,
  getDebtSummary,
} = require('../controllers/debtController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/').post(createDebt).get(getDebts);
router.get('/summary', getDebtSummary);
router.put('/:id/settle', settleDebt);
router.put('/:id', updateDebt);
router.delete('/:id', deleteDebt);

module.exports = router;