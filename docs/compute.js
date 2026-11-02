/**
 * 風味記帳｜共用計算邏輯
 * ------------------------------------------------------------
 * 這個檔案「同時」用在兩個地方，內容必須一模一樣：
 *   1. App（docs/compute.js）：離線也能算月結
 *   2. Google Apps Script（貼成 compute.gs）：產生試算表報表
 * 只用純 JavaScript，不碰試算表或網頁。
 */

function pad2_(x) { return ('0' + x).slice(-2); }

function prevMonth_(month) {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  return m === 1 ? (y - 1) + '-12' : y + '-' + pad2_(m - 1);
}

function daysInMonth_(month) {
  return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
}

/**
 * D = { stores:[{name,fee,cashIn,cashWarn}], partners:[{store,name,pct}],
 *       daily:[{store,date,closed,site,panda,uber,allpay,line,cashDiff}],
 *       purchase:[{store,date,cat,amount}], expense:[{store,month,type,amount}],
 *       payroll:[{store,month,name,kind,amount}], delivery:[{store,month,platform,amount}],
 *       deduct:[{store,month,type,amount}], employees:{店名:[姓名]} }
 * today = 'yyyy-MM-dd'
 */
function computeAll_(D, today) {
  const curMonth = today.slice(0, 7);
  const lastMonth = prevMonth_(curMonth);
  const storeMap = {};
  D.stores.forEach(function (s) { storeMap[s.name] = s; });
  const M = {};
  function get(store, month) {
    const k = store + '|' + month;
    if (!M[k]) M[k] = { store: store, month: month, days: 0, dates: {}, site: 0, pandaG: 0, uberG: 0,
      allpay: 0, line: 0, cashDiff: 0, pandaN: null, uberN: null, purchase: 0, staff: 0, staffNames: {},
      fixed: 0, other: 0, bonus: 0, reserve: 0, deductOther: 0, cats: {}, warns: [] };
    return M[k];
  }
  function fmt(n) { return (Math.round(n) || 0).toLocaleString('en-US'); }
  function n(x) { x = Number(x); return isFinite(x) ? x : 0; }

  D.daily.forEach(function (r) {
    if (!r.store || !r.date) return;
    const m = get(r.store, r.date.slice(0, 7));
    m.dates[r.date] = true;
    if (r.closed) return;
    m.days++; m.site += n(r.site); m.pandaG += n(r.panda); m.uberG += n(r.uber);
    m.allpay += n(r.allpay); m.line += n(r.line); m.cashDiff += n(r.cashDiff);
    const st = storeMap[r.store];
    if (st && Math.abs(n(r.cashDiff)) > st.cashWarn) m.warns.push(['現金差額', r.date + ' 現金差 ' + fmt(r.cashDiff) + ' 元']);
  });
  D.purchase.forEach(function (r) {
    if (!r.store || !r.date) return;
    const m = get(r.store, r.date.slice(0, 7));
    m.purchase += n(r.amount);
    m.cats[r.cat] = (m.cats[r.cat] || 0) + n(r.amount);
  });
  D.expense.forEach(function (r) {
    if (!r.store || !r.month) return;
    const m = get(r.store, r.month);
    if (r.type === '固定') m.fixed += n(r.amount); else m.other += n(r.amount);
  });
  D.payroll.forEach(function (r) {
    if (!r.store || !r.month) return;
    const m = get(r.store, r.month);
    if (r.kind !== '預支') m.staff += n(r.amount);
    m.staffNames[r.name] = true;
  });
  D.delivery.forEach(function (r) {
    if (!r.store || !r.month) return;
    const m = get(r.store, r.month);
    if (r.platform === 'Panda') m.pandaN = (m.pandaN || 0) + n(r.amount);
    if (r.platform === 'Uber') m.uberN = (m.uberN || 0) + n(r.amount);
  });
  D.deduct.forEach(function (r) {
    if (!r.store || !r.month) return;
    const m = get(r.store, r.month);
    if (r.type === '員工分紅') m.bonus += n(r.amount);
    else if (r.type === '年終預留') m.reserve += n(r.amount);
    else m.deductOther += n(r.amount);
  });

  const months = [], shares = [], cats = [], warns = [];

  D.stores.forEach(function (s) {
    const ps = D.partners.filter(function (p) { return p.store === s.name; });
    const sum = ps.reduce(function (a, p) { return a + n(p.pct); }, 0);
    if (!ps.length) warns.push({ store: s.name, month: '', type: '股東設定', text: '還沒設定股東比例' });
    else if (Math.abs(sum - 100) > 0.001) warns.push({ store: s.name, month: '', type: '股東設定', text: '股東比例加起來是 ' + sum + '%，不是 100%' });
  });

  Object.keys(M).sort().forEach(function (k) {
    const m = M[k];
    const st = storeMap[m.store] || { fee: 0, cashIn: false };
    const status = m.month === curMonth ? '進行中' : (m.month > curMonth ? '未來' : '已結束');

    if (status === '進行中') m.warns.push(['未結帳', '本月還沒結束，數字只供參考，先不要拿來分紅']);
    if (m.pandaG > 0 && m.pandaN === null) m.warns.push(['外送未對帳', 'Panda 營業額 ' + fmt(m.pandaG) + '，實際入帳還沒填，盈餘會被低估']);
    if (m.uberG > 0 && m.uberN === null) m.warns.push(['外送未對帳', 'Uber 營業額 ' + fmt(m.uberG) + '，實際入帳還沒填，盈餘會被低估']);

    if (Object.keys(m.dates).length && status !== '未來') {
      const lastDay = status === '進行中' ? Number(today.slice(8, 10)) - 1 : daysInMonth_(m.month);
      const miss = [];
      for (let d = 1; d <= lastDay; d++) {
        if (!m.dates[m.month + '-' + pad2_(d)]) miss.push(Number(m.month.slice(5, 7)) + '/' + d);
      }
      if (miss.length) m.warns.push(['缺少每日結帳', miss.length + ' 天沒有紀錄（公休也請按公休）：' + miss.slice(0, 10).join('、') + (miss.length > 10 ? '…' : '')]);
    }
    if (status === '已結束' && m.days > 0) {
      if (m.staff === 0) m.warns.push(['人事未填', '這個月還沒有填人事薪資']);
      if (m.fixed === 0) m.warns.push(['固定支出未填', '房租、電話等固定支出還沒填']);
    }
    if (m.month === lastMonth && m.staff !== 0) {
      const miss2 = ((D.employees || {})[m.store] || []).filter(function (x) { return !m.staffNames[x]; });
      if (miss2.length) m.warns.push(['人事未填', '在職員工沒填薪資：' + miss2.join('、') + '（沒上班可忽略）']);
    }

    const actual = m.site + (m.pandaN || 0) + (m.uberN || 0);
    const fee = Math.round((m.allpay + m.line) * n(st.fee) / 100);
    const profit = actual - m.purchase - m.staff - m.fixed - m.other - fee + (st.cashIn ? m.cashDiff : 0);
    const dist = profit - m.bonus - m.reserve - m.deductOther;
    if (status === '已結束' && dist < 0) m.warns.push(['虧損', '可分配金額為負數 ' + fmt(dist) + '，股東分紅會是負的']);

    months.push({ store: m.store, month: m.month, status: status, days: m.days, site: m.site,
      pandaG: m.pandaG, pandaN: m.pandaN, uberG: m.uberG, uberN: m.uberN, actual: actual,
      avg: m.days ? Math.round(actual / m.days) : 0, purchase: m.purchase, staff: m.staff,
      fixed: m.fixed, other: m.other, fee: fee, cashDiff: m.cashDiff, profit: profit,
      bonus: m.bonus, reserve: m.reserve, deductOther: m.deductOther, dist: dist,
      purchasePct: actual ? m.purchase / actual : 0, staffPct: actual ? m.staff / actual : 0,
      warnCount: m.warns.length });

    D.partners.filter(function (p) { return p.store === m.store; }).forEach(function (p) {
      shares.push({ store: m.store, month: m.month, status: status, name: p.name, pct: n(p.pct), amount: Math.round(dist * n(p.pct) / 100) });
    });
    Object.keys(m.cats).forEach(function (c) {
      cats.push({ store: m.store, month: m.month, cat: c, amount: m.cats[c], pct: actual ? m.cats[c] / actual : 0 });
    });
    m.warns.forEach(function (w) { warns.push({ store: m.store, month: m.month, type: w[0], text: w[1] }); });
  });

  return { months: months, shares: shares, cats: cats, warns: warns };
}

/**
 * 把一筆「操作」套用到資料上（App 用來在離線時立刻顯示結果）。
 * state = { daily:[], purchase:[], expense:[], payroll:[], delivery:[], deduct:[] }
 */
function applyOp_(state, op, store) {
  const d = op.data || {};
  function keep(arr, pred) { return arr.filter(function (r) { return !pred(r); }); }
  switch (op.type) {
    case 'daily.upsert':
      state.daily = keep(state.daily, function (r) { return r.date === d.date; });
      state.daily.push(Object.assign({ store: store }, d));
      break;
    case 'purchase.add':
      state.purchase = keep(state.purchase, function (r) { return r.id === d.id; });
      state.purchase.push(Object.assign({ store: store }, d));
      break;
    case 'purchase.del':
      state.purchase = keep(state.purchase, function (r) { return r.id === d.id; });
      break;
    case 'expense.add':
      state.expense = keep(state.expense, function (r) { return r.id === d.id; });
      state.expense.push(Object.assign({ store: store }, d));
      break;
    case 'expense.del':
      state.expense = keep(state.expense, function (r) { return r.id === d.id; });
      break;
    case 'deduct.add':
      state.deduct = keep(state.deduct, function (r) { return r.id === d.id; });
      state.deduct.push(Object.assign({ store: store }, d));
      break;
    case 'deduct.del':
      state.deduct = keep(state.deduct, function (r) { return r.id === d.id; });
      break;
    case 'payroll.upsert':
      state.payroll = keep(state.payroll, function (r) { return r.month === d.month && r.name === d.name; });
      (d.items || []).forEach(function (it) {
        state.payroll.push({ store: store, month: d.month, name: d.name, item: it.item, amount: it.amount,
          kind: it.kind, hours: it.hours, rate: it.rate, editedAt: d.editedAt });
      });
      break;
    case 'delivery.upsert':
      state.delivery = keep(state.delivery, function (r) { return r.month === d.month && r.platform === d.platform; });
      state.delivery.push(Object.assign({ store: store }, d));
      break;
  }
  return state;
}

if (typeof module !== 'undefined') module.exports = { computeAll_: computeAll_, applyOp_: applyOp_, prevMonth_: prevMonth_ };
