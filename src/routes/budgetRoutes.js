const express = require('express');
const router = express.Router();
const { setBudget, getBudgets, deleteBudget } = require('../controllers/budgetController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/').post(setBudget).get(getBudgets);
router.delete('/:id', deleteBudget);

module.exports = router;