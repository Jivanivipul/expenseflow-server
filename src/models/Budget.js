const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // "YYYY-MM" format, e.g. "2026-10"
    month: {
      type: String,
      required: [true, 'Month is required'],
      match: [/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'],
    },
    // If category is null/empty → this is an OVERALL budget for the month
    // If category is set → this is a CATEGORY-specific budget
    category: {
      type: String,
      trim: true,
      default: null,
    },
    limit: {
      type: Number,
      required: [true, 'Limit is required'],
      min: [1, 'Limit must be greater than 0'],
    },
  },
  { timestamps: true }
);

// Prevent duplicate budgets for same user + month + category
budgetSchema.index({ user: 1, month: 1, category: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);