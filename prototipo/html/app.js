'use strict';
/* Atlas MTI — Backoffice (protótipo HTML gerado a partir dos JSONs do épico) */
const PREFIX = 'form-patlasv4-proto-';
const FORMS = {};
ATLAS_FORMS.forEach(f => (FORMS[f.id] = f));
const WS = ATLAS_WORKSPACES;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ms = n => `<span class="ms">${esc(n)}</span>`;
const short = id => id.replace(PREFIX, '');
const full = s => (FORMS[s] ? s : PREFIX + s);
const cleanName = n => String(n || '').replace(/\s+[—-]\s+(Principal|Embutid.*|Método.*)$/, '').replace(/\s+/g, ' ').trim();

/* ---------- registros (em memória) ---------- */
const RECS = {};
function recs(formId) {
  if (RECS[formId]) return RECS[formId];
  const f = FORMS[formId];
  return (RECS[formId] = ((f && f.exampleValuePresets) || []).map(p => ({
    name: p.name, color: p.iconColor,
    values: JSON.parse(JSON.stringify(p.fieldValues || {})),
    rows: JSON.parse(JSON.stringify(p.embeddedRowsByFieldId || {})),
  })));
}
function asRows(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(x => x && typeof x === 'object');
  if (v.embeddedDemoInstances) return asRows(v.embeddedDemoInstances);
  return typeof v === 'object' ? [v] : [];
}
const getVal = (rec, fid) => (rec.values && fid in rec.values ? rec.values[fid] : undefined);
const getRows = (rec, fid) => asRows(rec.rows && rec.rows[fid] !== undefined ? rec.rows[fid] : rec.values && rec.values[fid]);

/* ---------- visibilidade ---------- */
function ruleMatch(r, rec) {
  const v = getVal(rec, r.sourceFieldId);
  if (r.sourceKind === 'boolean') return !!v === !!r.expectedBoolean;
  return String(v ?? '') === String(r.expectedOptionText ?? '');
}
function visibleFields(form, rec) {
  const rules = form.fieldVisibilityRules || [];
  const showT = new Set(rules.filter(r => r.action === 'show').flatMap(r => r.targetFieldIds));
  const vis = new Set();
  for (const f of form.fields) {
    let ok = !f.hidden;
    if (showT.has(f.id)) ok = rules.some(r => r.action === 'show' && r.targetFieldIds.includes(f.id) && ruleMatch(r, rec));
    if (rules.some(r => r.action === 'hide' && r.targetFieldIds.includes(f.id) && ruleMatch(r, rec))) ok = false;
    if (f.visibleWhen && f.visibleWhen.fieldId) ok = ok && String(getVal(rec, f.visibleWhen.fieldId) ?? '') === String(f.visibleWhen.equals);
    if (ok) vis.add(f.id);
  }
  return vis;
}
function methodVisible(m, rec) {
  const w = m.visibleWhen;
  if (!w || !rec) return true;
  const v = String(getVal(rec, w.sourceFieldId) ?? '');
  if (w.expectedOptionTexts) return w.expectedOptionTexts.includes(v);
  if (w.expectedOptionText !== undefined) return v === w.expectedOptionText;
  return true;
}

/* ---------- formatação ---------- */
const fmtDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : s; };
function fmtVal(f, v) {
  if (v === undefined || v === null || v === '') return '';
  if (Array.isArray(v)) return v.map(x => fmtVal(f, x)).join(', ');
  if (f.type === 'boolean') return v ? 'Sim' : 'Não';
  if (f.type === 'date') return fmtDate(v);
  if ((f.type === 'decimal' || f.type === 'number') && f.currency) return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (f.type === 'decimal') return Number(v).toLocaleString('pt-BR');
  if (typeof v === 'object') return '';
  return String(v);
}
function titleOf(form, rec) {
  const idf = form.fields.filter(f => f.relevance === 'identity' && !['embeddedReference', 'html', 'alert', 'file'].includes(f.type));
  for (const f of idf) { const v = fmtVal(f, getVal(rec, f.id)); if (v) return v; }
  for (const f of form.fields) { if (['text', 'textOptions'].includes(f.type)) { const v = fmtVal(f, getVal(rec, f.id)); if (v) return v; } }
  return rec.name || 'Novo registro';
}
function toast(msg, icon = 'check_circle') {
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = ms(icon) + esc(msg);
  $('#toast-root').appendChild(t); setTimeout(() => t.remove(), 3600);
}

/* ---------- campos ---------- */
let CTX = null; // { mode, rec, rerender }
function fieldHtml(f, rec, mode, vis, depth) {
  const v = getVal(rec, f.id);
  const edit = mode === 'edit' && !f.readOnly;
  const cls = `f ${f.size || 'medium'} ${f.relevance === 'identity' ? 'identity' : ''}`;
  const tip = f.spec ? `<span class="ms" title="${esc(f.spec.replace(/\*\*/g, ''))}">info</span>` : '';
  const label = `<label>${esc(f.label)}${f.required && edit ? '<span class="req"> *</span>' : ''}${tip}</label>`;
  const d = `data-fid="${esc(f.id)}"`;
  if (f.type === 'alert') {
    return `<div class="f large"><div class="alert ${esc(f.alertVariant || 'info')}"><b>${esc(f.alertTitle || f.label)}</b>${esc(f.alertMessage || '')}</div></div>`;
  }
  if (f.type === 'html') {
    const body = f.htmlContent
      ? `<iframe class="html-frame" sandbox srcdoc="${esc(f.htmlContent)}"></iframe>`
      : `<div class="panel-html">${ms('dashboard')} Painel analítico — ${esc(f.spec || 'exibido em tempo de execução')}</div>`;
    return `<div class="f large">${label}${body}</div>`;
  }
  if (f.type === 'embeddedReference') return `<div class="f large">${label}${embeddedHtml(f, rec, mode, depth)}</div>`;
  let inner;
  if (!edit) {
    if (f.type === 'file') inner = v ? `<span class="chip">${ms('attach_file')}${esc(Array.isArray(v) ? v.join(', ') : v)}</span>` : '';
    else if (f.type === 'boolean') inner = v === undefined ? '' : `<span class="chip ${v ? 'ok' : 'no'}">${v ? 'Sim' : 'Não'}</span>`;
    else if (f.type === 'reference' && v) inner = [].concat(v).map(x => refLink(f, x)).join('');
    else if (f.type === 'textOptions' && v) inner = [].concat(v).map(x => `<span class="chip">${esc(x)}</span>`).join('');
    else if (f.type === 'parecer' && v) inner = `<span class="chip">${esc(v)}</span>`;
    else inner = esc(fmtVal(f, v));
    return `<div class="${cls}">${label}<div class="val ${inner ? '' : 'empty-v'}">${inner || '—'}</div></div>`;
  }
  switch (f.type) {
    case 'boolean':
      inner = `<label class="switch"><input type="checkbox" ${d} ${v ? 'checked' : ''}> ${v ? 'Sim' : 'Não'}</label>`; break;
    case 'textOptions': case 'parecer': {
      const opts = f.options || [];
      if (f.type === 'parecer') inner = `<div class="radio-row">${opts.map(o => `<label class="${v === o ? 'on' : ''}"><input type="radio" hidden name="${esc(f.id)}" ${d} value="${esc(o)}" ${v === o ? 'checked' : ''}>${esc(o)}</label>`).join('')}</div>`;
      else if (f.multiple) inner = `<select multiple size="${Math.min(5, opts.length)}" ${d}>${opts.map(o => `<option ${[].concat(v || []).includes(o) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      else inner = `<select ${d}><option value=""></option>${opts.map(o => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      break;
    }
    case 'reference': {
      const lid = `dl-${f.id}`;
      const optsList = f.options || refCandidates(f);
      inner = `<input type="text" ${d} list="${esc(lid)}" value="${esc(Array.isArray(v) ? v.join(', ') : v ?? '')}" placeholder="Selecione…"><datalist id="${esc(lid)}">${optsList.map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
      break;
    }
    case 'date': inner = `<input type="date" ${d} value="${esc(v ?? '')}">`; break;
    case 'number': case 'decimal': inner = `<input type="number" step="${f.type === 'decimal' ? '0.01' : '1'}" ${d} value="${esc(v ?? '')}">`; break;
    case 'file': inner = `<input type="file" ${d}>${v ? `<div class="muted">Atual: ${esc(v)}</div>` : ''}`; break;
    default:
      inner = f.textLong ? `<textarea ${d}>${esc(v ?? '')}</textarea>` : `<input type="text" ${d} value="${esc(v ?? '')}">`;
  }
  return `<div class="${cls}">${label}${inner}</div>`;
}
function refCandidates(f) {
  const lf = FORMS[f.linkedFormId]; if (!lf) return [];
  return recs(lf.id).map(r => titleOf(lf, r)).filter((x, i, a) => x && a.indexOf(x) === i);
}
function refLink(f, text) {
  const lf = FORMS[f.linkedFormId];
  if (lf) { const i = recs(lf.id).findIndex(r => titleOf(lf, r) === text); if (i >= 0) return `<a class="chip" href="#/explorer/-/${short(lf.id)}/${i}">${esc(text)}</a>`; }
  return `<span class="chip">${esc(text)}</span>`;
}

/* ---------- embutidas ---------- */
let MODAL_SEQ = 0; const ROWSTORE = {};
function embeddedHtml(f, rec, mode, depth) {
  const lf = FORMS[f.linkedFormId];
  const rows = getRows(rec, f.id);
  if (!lf) return `<div class="val empty-v">${esc(fmtVal(f, getVal(rec, f.id))) || '—'}</div>`;
  if (f.embeddedDisplay === 'form') {
    const row = rows[0] || {};
    return `<div class="emb-form">${formBody(lf, { values: row, rows: row }, mode === 'edit' && !f.readOnly ? 'edit' : 'read', depth + 1)}</div>`;
  }
  const hidden = new Set(f.embeddedTableHiddenFieldIds || []);
  const cols = lf.fields.filter(c => !c.hidden && !hidden.has(c.id) && !['html', 'alert'].includes(c.type)).slice(0, 7);
  if (!rows.length) return `<div class="emb"><div class="empty">Nenhum item.</div></div>`;
  const key = 'r' + (++MODAL_SEQ);
  ROWSTORE[key] = { lf, rows };
  const head = cols.map(c => `<th>${esc(c.label)}</th>`).join('');
  const body = rows.map((r, i) => `<tr class="click" data-row="${key}:${i}">${cols.map(c => {
    if (c.type === 'embeddedReference') { const n = asRows(r[c.id]).length; return `<td>${n ? `<span class="chip">${n} item(ns)</span>` : ''}</td>`; }
    const v = r[c.id];
    if (c.type === 'boolean') return `<td>${v === undefined ? '' : v ? 'Sim' : 'Não'}</td>`;
    return `<td>${esc(fmtVal(c, v))}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="emb tbl-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* ---------- corpo do formulário (seções) ---------- */
let TABSTATE = {};
function fieldsGrid(fields, rec, mode, vis, depth) {
  const h = fields.filter(f => vis.has(f.id)).map(f => fieldHtml(f, rec, mode, vis, depth)).join('');
  return h ? `<div class="fields">${h}</div>` : '';
}
function formBody(form, rec, mode, depth = 0) {
  const vis = visibleFields(form, rec);
  const secs = form.sections || [];
  const layout = form.sectionLayout || 'none';
  if (!secs.length || layout === 'none') return fieldsGrid(form.fields, rec, mode, vis, depth) || `<div class="empty">Sem campos visíveis.</div>`;
  const tops = secs.filter(s => !s.parentSectionId);
  const kids = s => secs.filter(c => c.parentSectionId === s.id);
  const fieldsOf = s => form.fields.filter(f => f.sectionId === s.id);
  const loose = form.fields.filter(f => !f.sectionId || !secs.some(s => s.id === f.sectionId));
  const secInner = (s, accordionKids) => {
    let h = fieldsGrid(fieldsOf(s), rec, mode, vis, depth);
    for (const c of kids(s)) {
      const inner = fieldsGrid(fieldsOf(c), rec, mode, vis, depth);
      if (!inner) continue;
      h += accordionKids
        ? `<details class="sec" open><summary>${c.icon ? ms(c.icon) : ''}${esc(c.title)}</summary><div class="sec-in">${inner}</div></details>`
        : `<div class="sec"><h4>${c.icon ? ms(c.icon) : ''}${esc(c.title)}</h4>${inner}</div>`;
    }
    return h;
  };
  const pre = fieldsGrid(loose, rec, mode, vis, depth);
  if (layout === 'accordion') {
    return pre + tops.map(s => { const i = secInner(s, false); return i ? `<details class="sec" open><summary>${s.icon ? ms(s.icon) : ''}${esc(s.title)}</summary><div class="sec-in">${i}</div></details>` : ''; }).join('');
  }
  const tabsOn = tops.filter(s => secInner(s, layout === 'tabsAccordion'));
  const k = form.id + (depth ? '#' + depth : '');
  const cur = tabsOn.find(s => s.id === TABSTATE[k]) || tabsOn[0];
  if (!cur) return pre;
  return `${pre}<div class="tabs" data-tabs="${esc(k)}">${tabsOn.map(s => `<button class="${s === cur ? 'on' : ''}" data-tab="${esc(s.id)}">${s.icon ? ms(s.icon) : ''}${esc(s.title)}</button>`).join('')}</div>${secInner(cur, layout === 'tabsAccordion')}`;
}

/* ---------- modal ---------- */
function openModal(title, bodyHtml, { footer = '', onMount, wide } = {}) {
  const el = document.createElement('div'); el.className = 'overlay';
  el.innerHTML = `<div class="modal" ${wide ? 'style="width:min(1100px,100%)"' : ''}><div class="modal-h"><h3>${esc(title)}</h3><span class="spacer" style="flex:1"></span><button class="btn ghost sm" data-close>${ms('close')}</button></div><div class="modal-b">${bodyHtml}</div>${footer ? `<div class="modal-f">${footer}</div>` : ''}</div>`;
  const close = () => el.remove();
  el.addEventListener('mousedown', e => { if (e.target === el) close(); });
  el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  $('#modal-root').appendChild(el);
  if (onMount) onMount(el, close);
  return { el, close };
}
function bindForm(root, form, rec, rerender) {
  root.addEventListener('change', e => {
    const t = e.target; const fid = t.dataset && t.dataset.fid; if (!fid) return;
    const f = form.fields.find(x => x.id === fid) || {};
    let v;
    if (t.type === 'checkbox') v = t.checked;
    else if (t.type === 'file') v = t.files[0] ? t.files[0].name : '';
    else if (t.multiple) v = [...t.selectedOptions].map(o => o.value);
    else if (t.type === 'number') v = t.value === '' ? '' : Number(t.value);
    else v = t.value;
    if (f.type === 'reference' && f.multiple && typeof v === 'string') v = v.split(',').map(s => s.trim()).filter(Boolean);
    rec.values[fid] = v;
    if (['boolean', 'textOptions', 'parecer'].includes(f.type) || (form.fieldVisibilityRules || []).some(r => r.sourceFieldId === fid)) rerender();
  });
}
function runMethod(m, form, rec) {
  const inf = m.inputFormId && FORMS[m.inputFormId];
  if (!inf) {
    openModal(m.name, `<p>${esc(m.spec || 'Executar o método sobre o registro atual.')}</p>`, {
      footer: `<button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>${ms(m.icon || 'play_arrow')}Executar</button>`,
      onMount: (el, close) => $('[data-ok]', el).addEventListener('click', () => { close(); toast(`Método “${m.name}” executado (simulação).`); }),
    }); return;
  }
  const draft = { values: {}, rows: {} };
  const p = (inf.exampleValuePresets || [])[0];
  if (p) { draft.values = JSON.parse(JSON.stringify(p.fieldValues || {})); draft.rows = JSON.parse(JSON.stringify(p.embeddedRowsByFieldId || {})); }
  const draw = (el) => { $('.mb', el).innerHTML = formBody(inf, draft, 'edit'); };
  openModal(m.name, `${m.spec ? `<p class="muted">${esc(m.spec)}</p>` : ''}<div class="mb"></div>`, {
    wide: true,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>${ms(m.icon || 'check')}Confirmar</button>`,
    onMount: (el, close) => {
      draw(el); bindForm(el, inf, draft, () => draw(el));
      el.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { TABSTATE[b.closest('[data-tabs]').dataset.tabs] = b.dataset.tab; draw(el); } });
      $('[data-ok]', el).addEventListener('click', () => { close(); toast(`“${m.name}” confirmado (simulação).`); });
    },
  });
}

/* ---------- views ---------- */
function wsById(id) { return WS.find(w => w.id === id) || WS[0]; }
function wsOfForm(fid) { return WS.find(w => w.packages.some(p => p.classes.some(c => c.linkedFormId === fid))); }
function renderTopbar(view) {
  const ws = state.ws;
  const nav = [['explorer', 'folder_open', 'Explorer', `#/explorer/${ws.id}`], ['portal', 'public', 'Portal', '#/portal'], ['flows', 'slideshow', 'Apresentações', '#/flows'], ['model', 'schema', 'Modelo', '#/model']];
  $('#topbar').className = 'topbar';
  $('#topbar').style.background = ws.explorerChromeColor || '';
  $('#topbar').innerHTML = `<div class="brand"><span class="logo">A</span>${esc((ATLAS_EPIC && ATLAS_EPIC.name) || 'Atlas')}</div>
    <nav class="topnav">${nav.map(n => `<a href="${n[3]}" class="${view === n[0] ? 'on' : ''}">${ms(n[1])}${n[2]}</a>`).join('')}</nav>
    <div class="topbar-right"><select id="ws-sel" title="Workspace">${WS.map(w => `<option value="${esc(w.id)}" ${w.id === ws.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select><span class="avatar">${esc(ws.explorerUserInitials || 'AT')}</span></div>`;
  $('#ws-sel').onchange = e => { location.hash = `#/explorer/${e.target.value}`; };
}
function sidebarHtml(ws, activeForm) {
  return `<aside class="sidebar"><input class="search" type="search" placeholder="Buscar classe…" id="cls-search">${ws.packages.map(p => `<div class="pkg ${p.classes.some(c => c.linkedFormId === activeForm) || ws.packages.length < 4 ? 'open' : ''}"><button>${ms('folder')}${esc(p.name)}${ms('chevron_right').replace('class="ms"', 'class="ms caret"')}</button><ul>${p.classes.map(c => `<li data-n="${esc(c.name.toLowerCase())}"><a href="#/explorer/${ws.id}/${short(c.linkedFormId)}" class="${c.linkedFormId === activeForm ? 'on' : ''}">${esc(c.name)}</a></li>`).join('')}</ul></div>`).join('')}</aside>`;
}
function bindSidebar(app) {
  app.querySelectorAll('.pkg>button').forEach(b => b.onclick = () => b.parentElement.classList.toggle('open'));
  const s = $('#cls-search', app);
  if (s) s.oninput = () => {
    const q = s.value.toLowerCase();
    app.querySelectorAll('.pkg').forEach(p => { let any = false; p.querySelectorAll('li').forEach(li => { const ok = !q || li.dataset.n.includes(q); li.style.display = ok ? '' : 'none'; any = any || ok; }); p.style.display = any ? '' : 'none'; if (q) p.classList.add('open'); });
  };
}
function viewExplorer(parts) {
  const ws = state.ws; const app = $('#app');
  const formId = parts[0] ? full(parts[0]) : null;
  const form = formId && FORMS[formId];
  let main = '';
  if (!form) {
    main = `<div class="page-head"><h1>${esc(ws.name)}</h1><span class="crumb">${ws.packages.length} pacotes · ${ws.packages.reduce((a, p) => a + p.classes.length, 0)} classes</span></div>
      <div class="grid-cards">${ws.packages.map(p => `<div class="card pkg-card"><h3>${ms('folder')}${esc(p.name)}</h3>${p.classes.map(c => `<a href="#/explorer/${ws.id}/${short(c.linkedFormId)}">${esc(c.name)} <span class="muted">(${recs(c.linkedFormId).length})</span></a>`).join('')}</div>`).join('')}</div>`;
  } else if (parts[1] === undefined) main = listHtml(form);
  else main = '<div id="rec"></div>';
  app.innerHTML = sidebarHtml(ws, formId) + `<main class="main">${main}</main>`;
  bindSidebar(app);
  if (form && parts[1] === undefined) bindList(form);
  if (form && parts[1] !== undefined) mountRecord(form, parts[1]);
}
function listCols(form) {
  const ok = f => !f.hidden && !['embeddedReference', 'html', 'alert', 'file', 'parecer'].includes(f.type);
  let cols = form.fields.filter(f => ok(f) && ['identity', 'highlight'].includes(f.relevance));
  if (cols.length < 2) cols = form.fields.filter(ok).slice(0, 5);
  return cols.slice(0, 6);
}
function className(formId) { const w = wsOfForm(formId); const c = w && w.packages.flatMap(p => p.classes).find(c => c.linkedFormId === formId); return c ? c.name : cleanName(FORMS[formId].name); }
function listHtml(form) {
  const cols = listCols(form); const rs = recs(form.id);
  const pkg = state.ws.packages.find(p => p.classes.some(c => c.linkedFormId === form.id));
  return `<div class="page-head"><div><div class="crumb">${esc(state.ws.name)}${pkg ? ' › ' + esc(pkg.name) : ''}</div><h1>${esc(className(form.id))}</h1></div><span class="spacer"></span><input type="search" id="rec-q" placeholder="Buscar registros…" style="width:240px"><button class="btn primary" id="new-rec">${ms('add')}Novo</button></div>
  <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Registro</th>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rs.map((r, i) => `<tr class="click" data-i="${i}"><td><b>${esc(r.name)}</b></td>${cols.map(c => {
    const v = getVal(r, c.id); if (c.type === 'boolean') return `<td>${v === undefined ? '' : `<span class="chip ${v ? 'ok' : 'no'}">${v ? 'Sim' : 'Não'}</span>`}</td>`;
    return `<td>${esc(fmtVal(c, v))}</td>`; }).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 1}"><div class="empty">Nenhum registro de exemplo. Use “Novo”.</div></td></tr>`}</tbody></table></div>`;
}
function bindList(form) {
  const base = `#/explorer/${state.ws.id}/${short(form.id)}/`;
  $('#new-rec').onclick = () => (location.hash = base + 'new');
  document.querySelectorAll('tr[data-i]').forEach(tr => tr.onclick = () => (location.hash = base + tr.dataset.i));
  $('#rec-q').oninput = e => { const q = e.target.value.toLowerCase(); document.querySelectorAll('tr[data-i]').forEach(tr => (tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none')); };
}
function mountRecord(form, idx) {
  const isNew = idx === 'new';
  const list = recs(form.id);
  const orig = isNew ? null : list[+idx];
  if (!isNew && !orig) { $('#rec').innerHTML = '<div class="empty">Registro não encontrado.</div>'; return; }
  let mode = isNew ? 'edit' : 'read';
  let draft = isNew ? { name: 'Novo registro', values: {}, rows: {} } : JSON.parse(JSON.stringify(orig));
  const root = $('#rec');
  const base = `#/explorer/${state.ws.id}/${short(form.id)}`;
  const draw = () => {
    const mt = (form.methods || []).filter(m => methodVisible(m, draft));
    const dest = mt.filter(m => m.kind !== 'menu'), menu = mt.filter(m => m.kind === 'menu');
    const mbtn = (m, c) => `<button class="btn ${c}" data-m="${esc(m.id)}" title="${esc(m.spec || '')}">${m.icon ? ms(m.icon) : ''}${esc(m.name)}</button>`;
    root.innerHTML = `<div class="page-head"><div class="crumb"><a href="${base}">${esc(className(form.id))}</a> › ${isNew ? 'Novo' : esc(orig.name)}</div></div>
    <div class="card"><div class="rec-head"><h2>${esc(isNew ? 'Novo registro' : titleOf(form, draft))}</h2><span class="spacer" style="flex:1"></span>
      ${!isNew && recs(form.id).length > 1 ? `<select id="preset-sel" style="width:auto" title="Exemplo">${recs(form.id).map((r, i) => `<option value="${i}" ${i === +idx ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>` : ''}
      ${mode === 'read' ? dest.map(m => mbtn(m, m.kind === 'destaque' ? 'primary' : '')).join('') : ''}
      ${mode === 'read' && menu.length ? `<div class="menu"><button class="btn" data-menu>${ms('more_vert')}Mais ações</button><div class="menu-pop">${menu.map(m => `<button data-m="${esc(m.id)}">${m.icon ? ms(m.icon) : ''}${esc(m.name)}</button>`).join('')}</div></div>` : ''}
      ${mode === 'read' ? `<button class="btn" id="b-edit">${ms('edit')}Editar</button>` : `<button class="btn" id="b-cancel">Cancelar</button><button class="btn primary" id="b-save">${ms('save')}Salvar</button>`}
    </div><div class="rec-body">${form.metadata ? `<p class="muted" style="margin:12px 0 4px">${esc(form.metadata)}</p>` : ''}<div style="padding-top:8px">${formBody(form, draft, mode)}</div></div></div>`;
  };
  draw();
  bindForm(root, form, draft, draw);
  root.addEventListener('click', e => {
    const t = e.target;
    const tab = t.closest('[data-tab]'); if (tab) { TABSTATE[tab.closest('[data-tabs]').dataset.tabs] = tab.dataset.tab; draw(); return; }
    const mb = t.closest('[data-m]'); if (mb) { const m = form.methods.find(x => x.id === mb.dataset.m); runMethod(m, form, draft); return; }
    const mn = t.closest('[data-menu]'); if (mn) { mn.parentElement.classList.toggle('open'); return; }
    const row = t.closest('tr[data-row]'); if (row) { const [k, i] = row.dataset.row.split(':'); const { lf, rows } = ROWSTORE[k]; openModal(cleanName(lf.name), formBody(lf, { values: rows[i], rows: rows[i] }, 'read', 1), { wide: true }); return; }
    if (t.closest('#b-edit')) { mode = 'edit'; draw(); }
    else if (t.closest('#b-cancel')) { if (isNew) location.hash = base; else { draft = JSON.parse(JSON.stringify(orig)); mode = 'read'; draw(); } }
    else if (t.closest('#b-save')) {
      const miss = form.fields.filter(f => f.required && !f.hidden && !f.readOnly && !['alert', 'html', 'embeddedReference', 'boolean'].includes(f.type) && (getVal(draft, f.id) === undefined || getVal(draft, f.id) === '' || (Array.isArray(getVal(draft, f.id)) && !getVal(draft, f.id).length)));
      if (miss.length) { toast('Campos obrigatórios: ' + miss.slice(0, 4).map(f => f.label).join(', ') + (miss.length > 4 ? '…' : ''), 'error'); return; }
      draft.name = isNew ? titleOf(form, draft) : draft.name;
      if (isNew) { list.push(draft); toast('Registro criado.'); location.hash = `${base}/${list.length - 1}`; }
      else { list[+idx] = draft; orig.name = draft.name; mode = 'read'; draw(); toast('Registro salvo.'); }
    }
  });
  root.addEventListener('change', e => { if (e.target.id === 'preset-sel') location.hash = `${base}/${e.target.value}`; });
}
document.addEventListener('click', e => { if (!e.target.closest('.menu')) document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open')); });

/* ---------- portal ---------- */
function viewPortal() {
  const p = ATLAS_PORTALS[0]; const app = $('#app');
  const secs = p.servicePortalHomeSections.map(s => {
    if (s.type === 'html') return `<div style="padding:16px 20px 0">${s.htmlContent}</div>`;
    return `<div style="padding:16px 20px"><h3>${esc(s.name)}</h3><div class="grid-cards">${s.services.map(sv => `<div class="card svc" data-svc="${esc(sv.id)}"><span class="ms" style="color:${p.servicePortalHomeColorPrimary}">${esc(sv.icon)}</span><div><h4>${esc(sv.name)}</h4><span class="muted">${esc(sv.description)}</span></div></div>`).join('')}</div></div>`;
  }).join('');
  app.innerHTML = `<main class="main"><div class="portal"><div class="hero" style="background:${p.servicePortalHomeColorPrimary};color:${p.servicePortalHomeColorText}"><h1>${esc(p.servicePortalHomeHeroTitle)}</h1><p>${esc(p.servicePortalHomeHeroSubtitle)}</p><input type="search" placeholder="${esc(p.servicePortalHomeSearchPlaceholder)}"></div>
  <div class="pbar">${p.servicePortalHeaderMenuOptions.map(o => `<a href="#/portal">${esc(o)}</a>`).join('')}<span class="spacer" style="flex:1"></span><span class="avatar" style="background:${p.servicePortalHomeColorPrimary};color:#fff">${esc(p.servicePortalHeaderUserInitials)}</span></div>
  <div class="card" style="border-radius:0 0 12px 12px">${secs}</div></div></main>`;
  app.querySelectorAll('[data-svc]').forEach(el => el.onclick = () => {
    if (el.dataset.svc === 'svc-patlasv4-acompanhar-vinculo') { const f = FORMS[PREFIX + 'solicitacao-vinculo']; openModal('Acompanhar solicitação', recs(f.id).length ? formBody(f, recs(f.id)[0], 'read') : '<div class="empty">Nenhuma solicitação.</div>', { wide: true }); }
    else runMethod({ name: 'Vincular-se a uma Organização', icon: 'group_add', spec: 'Informe o código de convite recebido do gestor da sua organização.', inputFormId: PREFIX + 'solicitacao-vinculo' }, null, null);
  });
}

/* ---------- apresentações ---------- */
let flowsLoaded = null;
function loadFlows() {
  if (window.ATLAS_FLOWS) return Promise.resolve();
  return flowsLoaded || (flowsLoaded = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'data/flows.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }));
}
async function viewFlows(parts) {
  const app = $('#app'); app.innerHTML = '<main class="main"><div class="empty">Carregando apresentações…</div></main>';
  await loadFlows();
  const flows = window.ATLAS_FLOWS; const fl = flows.find(f => f.id === parts[0]);
  if (!fl) {
    app.innerHTML = `<main class="main"><div class="page-head"><h1>Apresentações</h1></div><div class="grid-cards">${flows.map(f => `<a class="card pkg-card" style="text-decoration:none;color:inherit" href="#/flows/${esc(f.id)}/0"><h3>${ms('slideshow')}${esc(f.name)}</h3><span class="muted">${f.steps.length} passos</span><p class="muted">${esc(f.metadata || '')}</p></a>`).join('')}</div></main>`; return;
  }
  const i = Math.min(+parts[1] || 0, fl.steps.length - 1); const s = fl.steps[i];
  app.innerHTML = `<main class="main"><div class="page-head"><div><div class="crumb"><a href="#/flows">Apresentações</a></div><h1>${esc(fl.name)}</h1></div></div><div class="flow-wrap"><div class="card steps">${fl.steps.map((st, k) => `<button class="${k === i ? 'on' : ''}" data-k="${k}"><span class="tag t-${esc(st.type)}">${esc(st.type)}</span>${esc(st.title)}</button>`).join('')}</div><div class="step-view card pad" id="step"></div></div></main>`;
  app.querySelectorAll('.steps [data-k]').forEach(b => b.onclick = () => (location.hash = `#/flows/${fl.id}/${b.dataset.k}`));
  const act = $('.steps .on'); if (act) act.scrollIntoView({ block: 'nearest' });
  const el = $('#step'); let h = `<h2 style="margin-top:0">${esc(s.title)}</h2>`;
  if (s.type === 'html' && s.htmlContent) h += `<iframe class="html-frame" style="height:70vh" sandbox srcdoc="${esc(s.htmlContent)}"></iframe>`;
  else {
    if (s.classPresentationDescription) h += `<p>${esc(s.classPresentationDescription)}</p>`;
    if (s.bpmnDescription) h += `<p>${esc(s.bpmnDescription)}</p>`;
    if (s.workspacePresentationDescription) h += `<p>${esc(s.workspacePresentationDescription)}</p>`;
    const kv = [['Responsável', [s.assigneeRole, s.assigneeRoleDetail].filter(Boolean).join(' — ')], ['Tipo BPMN', s.bpmnTaskType], ['SLA', s.bpmnSla]].filter(x => x[1]);
    const lst = (t, a) => a && a.length ? `<h4>${t}</h4><ul>${a.map(x => `<li>${esc(typeof x === 'object' ? (x.key || x.label || x.name || JSON.stringify(x)) + (x.value ? ' → ' + x.value : '') : x)}</li>`).join('')}</ul>` : '';
    if (kv.length) h += `<dl class="kv">${kv.map(x => `<dt>${x[0]}</dt><dd>${esc(x[1])}</dd>`).join('')}</dl>`;
    h += lst('Entradas', [].concat(s.bpmnInputs || [])) + lst('Saídas', [].concat(s.bpmnOutputs || [])) + lst('Regras', s.bpmnRuleList) + lst('Caminhos possíveis', s.bpmnPossiblePaths);
    if (s.linkedFormId && FORMS[s.linkedFormId]) h += `<p><a class="btn primary" href="#/explorer/-/${short(s.linkedFormId)}${s.type === 'class' && recs(s.linkedFormId).length ? '/0' : ''}">${ms('open_in_new')}Abrir no Explorer</a> ${s.type === 'method' ? '<button class="btn" id="open-m">' + ms('play_arrow') + 'Simular método</button>' : ''}</p>`;
  }
  el.innerHTML = h;
  const om = $('#open-m', el); if (om) om.onclick = () => runMethod({ name: cleanName(FORMS[s.linkedFormId].name), inputFormId: s.linkedFormId }, null, null);
  const nav = document.createElement('div'); nav.style.cssText = 'display:flex;justify-content:space-between;margin-top:16px';
  nav.innerHTML = `<a class="btn" href="#/flows/${fl.id}/${Math.max(0, i - 1)}">${ms('chevron_left')}Anterior</a><a class="btn primary" href="#/flows/${fl.id}/${Math.min(fl.steps.length - 1, i + 1)}">Próximo${ms('chevron_right')}</a>`;
  el.appendChild(nav);
}

/* ---------- modelo (classes por fase) ---------- */
function viewModel() {
  const G = ATLAS_GROUPS; const app = $('#app'); const byId = Object.fromEntries(G.groups.map(g => [g.id, g]));
  const members = id => (G.memberOrderByGroup[id] || []).filter(x => FORMS[x]);
  const phases = G.groups.filter(g => g.kind === 'fase');
  const block = g => { const kids = G.groups.filter(c => c.parentGroupId === g.id); const own = members(g.id);
    return `<details class="sec" ${g.kind ? 'open' : ''}><summary>${ms(g.kind ? 'layers' : 'folder')}${esc(g.name.trim())} <span class="muted">(${own.length})</span></summary><div class="sec-in">${own.length ? `<table class="tbl"><tbody>${own.map(id => `<tr class="click" data-f="${short(id)}"><td>${esc(cleanName(FORMS[id].name))}</td><td class="muted">${FORMS[id].fields.length} campos</td><td class="muted">${(FORMS[id].methods || []).length ? (FORMS[id].methods.length + ' métodos') : ''}</td></tr>`).join('')}</tbody></table>` : ''}${kids.map(block).join('')}</div></details>`; };
  const loose = (G.memberOrderByGroup.__sem_grupo__ || []).filter(x => FORMS[x]);
  app.innerHTML = `<main class="main"><div class="page-head"><h1>Modelo de classes</h1><span class="crumb">${ATLAS_FORMS.length} formulários · agrupados por fase (class-groups.json)</span></div>${phases.map(block).join('')}${G.groups.filter(g => !g.kind && !g.parentGroupId).map(block).join('')}<details class="sec"><summary>${ms('folder_off')}Sem grupo <span class="muted">(${loose.length})</span></summary><div class="sec-in"><table class="tbl"><tbody>${loose.map(id => `<tr class="click" data-f="${short(id)}"><td>${esc(cleanName(FORMS[id].name))}</td><td class="muted">${FORMS[id].fields.length} campos</td></tr>`).join('')}</tbody></table></div></details></main>`;
  app.querySelectorAll('tr[data-f]').forEach(tr => tr.onclick = () => (location.hash = `#/explorer/-/${tr.dataset.f}${recs(full(tr.dataset.f)).length ? '/0' : ''}`));
}

/* ---------- roteador ---------- */
const state = { ws: WS[0] };
function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'explorer').split('/').map(decodeURIComponent);
  const view = parts.shift();
  if (view === 'explorer') {
    const w = parts.shift();
    if (WS.some(x => x.id === w)) state.ws = wsById(w);
    const tf = parts[0] && full(parts[0]);
    if (tf && !state.ws.packages.some(p => p.classes.some(c => c.linkedFormId === tf))) state.ws = wsOfForm(tf) || state.ws;
    renderTopbar('explorer'); viewExplorer(parts);
  } else if (view === 'portal') { renderTopbar('portal'); viewPortal(); }
  else if (view === 'flows') { renderTopbar('flows'); viewFlows(parts); }
  else if (view === 'model') { renderTopbar('model'); viewModel(); }
  else { location.hash = '#/explorer'; }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();
