const express = require('express');
const router = express.Router();
const { getReport, exportCSV, exportPDF } = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', getReport);
router.get('/export', exportCSV);
router.get('/export-pdf', exportPDF);

module.exports = router;