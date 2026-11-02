const express = require('express');
const router = express.Router();
const {
  createAccount,
  getAccounts,
  updateAccount,
  deleteAccount,
} = require('../controllers/accountController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/').post(createAccount).get(getAccounts);
router.route('/:id').put(updateAccount).delete(deleteAccount);

module.exports = router;