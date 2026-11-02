const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Optional: drop NotoSans-Regular.ttf and NotoSans-Bold.ttf into server/src/utils/fonts
// Without them, the report falls back to "Rs." (built-in Helvetica cannot render ₹).
const FONT_DIR = path.join(__dirname, 'fonts');
const TZ = 'Asia/Kolkata';

const C = {
  text: '#111827',
  muted: '#6b7280',
  line: '#e5e7eb',
  headerBg: '#eef2f7',
  zebra: '#f9fafb',
  income: '#047857',
  expense: '#b91c1c',
  accent: '#2563eb',
};

const fmtDate = (d) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d));
const fmtISO = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d));
const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Streams the PDF into `res`.
 * `end` is exclusive (start of the day AFTER the last day).
 */
function buildExpenseReport(res, { period, start, end, income, expense, transactions }) {
  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    bufferPages: true,
    info: { Title: 'ExpenseFlow Report', Author: 'ExpenseFlow' },
  });

  doc.on('error', () => res.destroy());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="report-${fmtISO(start)}_to_${fmtISO(end.getTime() - 86400000)}.pdf"`
  );
  doc.pipe(res);

  // ---------- fonts & money ----------
  const regularPath = path.join(FONT_DIR, 'NotoSans-Regular.ttf');
  const boldPath = path.join(FONT_DIR, 'NotoSans-Bold.ttf');
  const unicode = fs.existsSync(regularPath) && fs.existsSync(boldPath);
  const F = { regular: 'Helvetica', bold: 'Helvetica-Bold' };
  if (unicode) {
    doc.registerFont('Body', regularPath);
    doc.registerFont('BodyBold', boldPath);
    F.regular = 'Body';
    F.bold = 'BodyBold';
  }
  const SYM = unicode ? '₹' : 'Rs.\u00a0';
  const num = (n) =>
    Math.abs(Number(n) || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const money = (n) => `${Number(n) < 0 ? '-' : ''}${SYM}${num(n)}`;
  const moneyShort = (n) =>
    `${Number(n) < 0 ? '-' : ''}${SYM}${Math.abs(Math.round(Number(n) || 0)).toLocaleString('en-IN')}`;

  // ---------- layout ----------
  const M = 40;
  const leftX = M;
  const rightX = doc.page.width - M;
  const contentWidth = rightX - leftX;
  const bottomLimit = doc.page.height - 60;
  const cellPad = 8;

  // ===== Title =====
  doc.font(F.bold).fontSize(22).fillColor(C.text).text('ExpenseFlow Report', { align: 'center' });
  doc.moveDown(0.3);
  doc.font(F.regular).fontSize(12).fillColor(C.muted).text(`${cap(period)} report`, { align: 'center' });
  doc.text(`${fmtDate(start)} – ${fmtDate(end.getTime() - 86400000)}`, { align: 'center' });
  doc.moveDown(1.2);

  // ===== Summary cards =====
  const net = income - expense;
  const cards = [
    { label: 'Income', value: moneyShort(income), color: C.income },
    { label: 'Expenses', value: moneyShort(expense), color: C.expense },
    { label: 'Net Savings', value: moneyShort(net), color: net >= 0 ? C.income : C.expense },
    { label: 'Transactions', value: String(transactions.length), color: C.text },
  ];
  const gap = 10;
  const cardW = (contentWidth - gap * (cards.length - 1)) / cards.length;
  const cardH = 58;
  const cardY = doc.y;
  cards.forEach((c, i) => {
    const x = leftX + i * (cardW + gap);
    doc.roundedRect(x, cardY, cardW, cardH, 6).lineWidth(0.7).strokeColor(C.line).stroke();
    doc.font(F.regular).fontSize(9).fillColor(C.muted).text(c.label, x + 10, cardY + 11, {
      width: cardW - 20,
      lineBreak: false,
    });
    let fs = 13;
    doc.font(F.bold);
    while (fs > 8 && doc.fontSize(fs).widthOfString(c.value) > cardW - 20) fs -= 0.5;
    doc.fontSize(fs).fillColor(c.color).text(c.value, x + 10, cardY + 28 + (13 - fs) / 2, { lineBreak: false });
  });
  doc.y = cardY + cardH + 22;
  doc.x = leftX;

  // ===== Top expense categories =====
  const byCat = {};
  transactions.forEach((t) => {
    if (t.type === 'expense')
      byCat[t.category || 'Other'] = (byCat[t.category || 'Other'] || 0) + Number(t.amount);
  });
  const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topCats.length) {
    const total = Object.values(byCat).reduce((s, v) => s + v, 0) || 1;
    doc.font(F.bold).fontSize(13).fillColor(C.text).text('Top expense categories', leftX, doc.y);
    let y = doc.y + 8;
    const labelW = 110;
    const amtW = 110;
    const barMax = contentWidth - labelW - amtW - 20;
    topCats.forEach(([name, amt]) => {
      const pct = amt / total;
      doc.font(F.regular).fontSize(10).fillColor(C.text).text(name, leftX, y, {
        width: labelW,
        lineBreak: false,
        ellipsis: true,
      });
      doc.roundedRect(leftX + labelW + 10, y + 2, barMax, 8, 4).fill(C.line);
      doc.roundedRect(leftX + labelW + 10, y + 2, Math.max(4, barMax * pct), 8, 4).fill(C.accent);
      doc.font(F.regular).fontSize(10).fillColor(C.text).text(`${money(amt)} (${Math.round(pct * 100)}%)`, rightX - amtW, y, {
        width: amtW,
        align: 'right',
        lineBreak: false,
      });
      y += 20;
    });
    doc.y = y + 12;
    doc.x = leftX;
  }

  // ===== Transactions table =====
  if (doc.y + 90 > bottomLimit) doc.addPage();
  doc.font(F.bold).fontSize(13).fillColor(C.text).text('Transactions', leftX, doc.y);
  const tableTop = doc.y + 8;

  const dateW = 70, typeW = 62, catW = 80, methodW = 62, amountW = 112;
  const descW = contentWidth - dateW - typeW - catW - methodW - amountW;
  const cols = [
    { label: 'Date', width: dateW, align: 'left' },
    { label: 'Type', width: typeW, align: 'left' },
    { label: 'Category', width: catW, align: 'left' },
    { label: 'Method', width: methodW, align: 'left' },
    { label: 'Amount', width: amountW, align: 'right' },
    { label: 'Description', width: descW, align: 'left' },
  ];
  const xs = [leftX];
  cols.forEach((c) => xs.push(xs[xs.length - 1] + c.width));

  const HEADER_H = 24;
  const drawHeader = (y) => {
    doc.rect(leftX, y, contentWidth, HEADER_H).fill(C.headerBg);
    doc.font(F.bold).fontSize(10).fillColor(C.text);
    cols.forEach((c, i) => {
      doc.text(c.label, xs[i] + cellPad, y + 7, { width: c.width - cellPad * 2, align: c.align, lineBreak: false });
    });
    doc.lineWidth(1).strokeColor('#333').moveTo(leftX, y + HEADER_H).lineTo(rightX, y + HEADER_H).stroke();
    return y + HEADER_H;
  };

  let y = drawHeader(tableTop);

  if (transactions.length === 0) {
    doc.font(F.regular).fontSize(11).fillColor(C.muted).text('No transactions in this period.', leftX, y + 20, {
      width: contentWidth,
      align: 'center',
    });
  } else {
    transactions.forEach((t, i) => {
      const desc = (t.description || '').trim() || '-';
      doc.font(F.regular).fontSize(9.5);
      const descH = doc.heightOfString(desc, { width: descW - cellPad * 2 });
      const rowH = Math.max(26, descH + 14);

      if (y + rowH > bottomLimit) {
        doc.addPage();
        y = drawHeader(M);
      }

      if (i % 2 === 0) doc.rect(leftX, y, contentWidth, rowH).fill(C.zebra);

      const isIncome = t.type === 'income';
      const cells = [
        fmtDate(t.date),
        cap(t.type),
        t.category || '-',
        t.paymentMethod || '-',
        `${isIncome ? '+' : '-'}${money(t.amount)}`,
        desc,
      ];
      cells.forEach((text, ci) => {
        const isAmount = ci === 4;
        doc
          .font(isAmount ? F.bold : F.regular)
          .fontSize(9.5)
          .fillColor(isAmount ? (isIncome ? C.income : C.expense) : C.text);
        doc.text(text, xs[ci] + cellPad, y + 8, {
          width: cols[ci].width - cellPad * 2,
          align: cols[ci].align,
          lineBreak: ci === 5,
          ellipsis: ci !== 5,
        });
      });

      doc.lineWidth(0.5).strokeColor(C.line);
      doc.moveTo(leftX, y + rowH).lineTo(rightX, y + rowH).stroke();
      xs.forEach((x) => doc.moveTo(x, y).lineTo(x, y + rowH).stroke());

      y += rowH;
    });
  }

  // ===== Footer on every page =====
  const range = doc.bufferedPageRange();
  for (let p = 0; p < range.count; p++) {
    doc.switchToPage(range.start + p);
    doc.page.margins.bottom = 0;
    doc.font(F.regular).fontSize(9).fillColor(C.muted);
    doc.text(`Generated on ${fmtDate(new Date())} by ExpenseFlow`, leftX, doc.page.height - 38, {
      width: contentWidth / 2,
      align: 'left',
      lineBreak: false,
    });
    doc.text(`Page ${p + 1} of ${range.count}`, leftX + contentWidth / 2, doc.page.height - 38, {
      width: contentWidth / 2,
      align: 'right',
      lineBreak: false,
    });
  }

  doc.end();
}

module.exports = { buildExpenseReport };