(() => {
  const KEY = "po_academy_v1";
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  const defaultState = () => ({
    ownerId: "",
    users: {},
    allow: [],
    profileName: "Owner",
    api: { base: "https://api.openai.com/v1", key: "", model: "gpt-4o-mini" },
    videos: PO_DATA.videos.slice(),
    books: PO_DATA.books.slice(),
    chat: [],
    presence: {},
    customCss: "",
    customJs: "",
    newsExtra: [],
    created: Date.now()
  });

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch {
      return defaultState();
    }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

  let state = load();
  let currentUser = {
    id: "guest",
    name: "Гость",
    username: "guest"
  };

  function detectUser() {
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
      const u = tg.initDataUnsafe.user;
      currentUser = {
        id: String(u.id),
        name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || String(u.id),
        username: u.username || String(u.id)
      };
      tg.ready();
      tg.expand();
      try { tg.setHeaderColor("#070b14"); tg.setBackgroundColor("#070b14"); } catch {}
    } else {
      const saved = localStorage.getItem(KEY + "_me");
      if (saved) currentUser = JSON.parse(saved);
    }
  }

  function isOwner() {
    return currentUser.id && state.ownerId && String(currentUser.id) === String(state.ownerId);
  }
  function isAllowed() {
    if (!state.allow.length && !state.ownerId) return true;
    if (isOwner()) return true;
    return state.allow.map(String).includes(String(currentUser.id));
  }

  function heartbeat() {
    state.presence = state.presence || {};
    state.presence[currentUser.id] = { name: currentUser.name, t: Date.now() };
    const now = Date.now();
    Object.keys(state.presence).forEach(id => {
      if (now - state.presence[id].t > 120000) delete state.presence[id];
    });
    save();
    const n = Math.max(1, Object.keys(state.presence).length);
    const el = document.getElementById("onlineCount");
    if (el) el.textContent = String(n);
  }

  function clocks() {
    const fmt = (tz) => new Date().toLocaleTimeString("ru-RU", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: tz });
    const m = document.getElementById("clkMsk");
    const k = document.getElementById("clkKiev");
    if (m) m.textContent = fmt("Europe/Moscow");
    if (k) k.textContent = fmt("Europe/Kyiv");
  }

  function $(id) { return document.getElementById(id); }
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const el = $(id);
    if (el) el.classList.add("active");
    document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("on", b.dataset.go === id));
    window.scrollTo(0, 0);
  }

  function applyCustom() {
    let tag = $("custom-css-tag");
    if (!tag) {
      tag = document.createElement("style");
      tag.id = "custom-css-tag";
      document.head.appendChild(tag);
    }
    tag.textContent = state.customCss || "";
    if (state.customJs) {
      try { new Function(state.customJs)(); } catch (e) { console.warn("custom js", e); }
    }
  }

  /* ===== GATE ===== */
  function renderGate() {
    $("gate").classList.add("active");
    $("appMain").classList.add("hidden");
    $("nav").classList.add("hidden");
    $("gateBox").innerHTML = `
      <div class="card">
        <h2>Доступ по User ID</h2>
        <p class="muted">Попасть в приложение можно только если хозяин добавил ваш Telegram User ID.</p>
        <div class="field">
          <label>Ваш ID сейчас</label>
          <input id="myIdView" value="${escapeHtml(currentUser.id)}" ${tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? "readonly" : ""}>
        </div>
        <div class="field">
          <label>Отображаемое имя</label>
          <input id="myNameView" value="${escapeHtml(currentUser.name)}">
        </div>
        ${!state.ownerId ? `
          <p class="muted">Список пуст — первый, кто войдёт, станет хозяином (owner).</p>
          <button class="btn primary full" id="btnBecomeOwner">Стать хозяином и открыть</button>
        ` : `
          <p class="muted">Хозяин уже назначен. Если ваш ID не в списке — вход закрыт.</p>
          <button class="btn primary full" id="btnTryEnter">Войти</button>
        `}
        <p class="muted" style="margin-top:10px">Вне Telegram можно вручную указать числовой ID (для теста). В Mini App ID берётся из Telegram автоматически.</p>
      </div>`;
    const bind = () => {
      currentUser.id = $("myIdView").value.trim() || "guest";
      currentUser.name = $("myNameView").value.trim() || currentUser.name;
      currentUser.username = currentUser.name;
      localStorage.setItem(KEY + "_me", JSON.stringify(currentUser));
    };
    $("btnBecomeOwner") && $("btnBecomeOwner").addEventListener("click", () => {
      bind();
      if (!currentUser.id || currentUser.id === "guest") return alert("Укажите числовой Telegram User ID");
      state.ownerId = String(currentUser.id);
      state.profileName = currentUser.name;
      state.users[currentUser.id] = { name: currentUser.name, role: "owner", added: Date.now() };
      if (!state.allow.includes(String(currentUser.id))) state.allow.push(String(currentUser.id));
      save();
      enterApp();
    });
    $("btnTryEnter") && $("btnTryEnter").addEventListener("click", () => {
      bind();
      if (!isAllowed()) {
        alert("Доступ запрещён. Попросите хозяина добавить ваш User ID: " + currentUser.id);
        return;
      }
      enterApp();
    });
  }

  function enterApp() {
    $("gate").classList.remove("active");
    $("appMain").classList.remove("hidden");
    $("nav").classList.remove("hidden");
    state.users[currentUser.id] = Object.assign({}, state.users[currentUser.id], {
      name: currentUser.name, last: Date.now()
    });
    save();
    applyCustom();
    renderHome();
    renderProfile();
    renderNeuro();
    renderKnowledge();
    renderPatterns();
    renderStrategies();
    renderCalc();
    renderCalendar();
    renderNews();
    renderChat();
    showScreen("screen-home");
    heartbeat();
  }

  /* ===== HOME ===== */
  function renderHome() {
    $("screen-home").innerHTML = `
      <div class="card">
        <h2>Терминал обучения</h2>
        <p class="muted">Закрытый Mini App под Pocket Option: теория, паттерны, M1-стратегии, математический сканер и ИИ. Это не брокер и не автоторговля.</p>
        <div class="hero-stats">
          <div class="stat"><b>${state.allow.length || 1}</b><span>в доступе</span></div>
          <div class="stat"><b>${PO_DATA.patterns.length}</b><span>паттернов</span></div>
          <div class="stat"><b>${PO_DATA.strategies.length}</b><span>стратегий M1</span></div>
        </div>
      </div>
      <div class="warn">Бинарные опционы — высокорисковый инструмент. Калькулятор и сканер считают модели, а не гарантируют прибыль. Капитал можно потерять.</div>
      <div class="grid grid-2">
        <button class="btn primary" data-jump="screen-neuro">Нейросеть + сканер</button>
        <button class="btn" data-jump="screen-calc">Калькулятор Мартингейл</button>
        <button class="btn" data-jump="screen-patterns">Паттерны как свечи</button>
        <button class="btn" data-jump="screen-chat">Чат трейдеров</button>
      </div>
    `;
    $("screen-home").querySelectorAll("[data-jump]").forEach(b => b.onclick = () => showScreen(b.dataset.jump));
  }

  /* ===== PROFILE ===== */
  function renderProfile() {
    const usersHtml = Object.keys(state.users).map(id => {
      const u = state.users[id];
      return `<div class="user-item"><div><b>${escapeHtml(u.name || id)}</b><div class="muted">${id} · ${u.role || "trader"}</div></div>
        ${isOwner() && id !== state.ownerId ? `<button class="btn ghost" data-del="${id}">удалить</button>` : ""}</div>`;
    }).join("") || `<p class="muted">Пока никого нет</p>`;

    $("screen-profile").innerHTML = `
      <div class="card">
        <h2>Профиль</h2>
        <p class="muted">${escapeHtml(currentUser.name)} · ID ${escapeHtml(currentUser.id)} ${isOwner() ? "· хозяин" : ""}</p>
        <div class="field"><label>Имя в приложении</label><input id="profName" value="${escapeHtml(currentUser.name)}"></div>
        <button class="btn primary" id="saveProf">Сохранить имя</button>
      </div>
      <div class="card">
        <h3>Ключи ИИ (OpenAI-compatible)</h3>
        <div class="field"><label>Base URL</label><input id="apiBase" value="${escapeHtml(state.api.base)}"></div>
        <div class="field"><label>API key</label><input id="apiKey" type="password" value="${escapeHtml(state.api.key)}" placeholder="sk-..."></div>
        <div class="field"><label>Модель</label><input id="apiModel" value="${escapeHtml(state.api.model)}"></div>
        <p class="muted">Ключ хранится локально в браузере Mini App. Для общего сервера вынесите ключ на бэкенд.</p>
        <button class="btn" id="saveApi">Сохранить ключи</button>
      </div>
      ${isOwner() ? `
      <div class="card">
        <h3>Панель управления</h3>
        <p class="muted">Добавление строго по Telegram User ID. Без ID в списке вход закрыт.</p>
        <div class="field"><label>User ID</label><input id="newUid" placeholder="например 123456789"></div>
        <div class="field"><label>Имя</label><input id="newUname" placeholder="Антон"></div>
        <button class="btn green" id="addUser">Добавить в доступ</button>
        <div style="margin-top:10px">${usersHtml}</div>
      </div>
      <div class="card">
        <h3>Разработчик внутри Mini App</h3>
        <p class="muted">Правки применяются сразу и пишутся в localStorage. Потом можно экспортировать JSON и залить в GitHub.</p>
        <div class="chips" id="edTabs">
          <span class="chip on" data-ed="css">CSS</span>
          <span class="chip" data-ed="js">JS</span>
          <span class="chip" data-ed="json">Экспорт</span>
        </div>
        <div class="field"><textarea class="editor" id="edCss">${escapeHtml(state.customCss)}</textarea></div>
        <div class="field hidden" id="wrapJs"><textarea class="editor" id="edJs">${escapeHtml(state.customJs)}</textarea></div>
        <div class="field hidden" id="wrapJson"><textarea class="editor" id="edJson"></textarea></div>
        <div class="row">
          <button class="btn primary" id="applyEd">Применить</button>
          <button class="btn" id="exportEd">Скачать backup.json</button>
          <button class="btn ghost" id="importEd">Импорт JSON</button>
        </div>
        <input type="file" id="importFile" accept="application/json" class="hidden">
      </div>` : `<div class="card"><p class="muted">Панель управления и редактор доступны только хозяину.</p></div>`}
    `;

    $("saveProf").onclick = () => {
      currentUser.name = $("profName").value.trim() || currentUser.name;
      localStorage.setItem(KEY + "_me", JSON.stringify(currentUser));
      if (state.users[currentUser.id]) state.users[currentUser.id].name = currentUser.name;
      save(); renderChat(); alert("Сохранено");
    };
    $("saveApi").onclick = () => {
      state.api = { base: $("apiBase").value.trim(), key: $("apiKey").value.trim(), model: $("apiModel").value.trim() };
      save(); alert("Ключи сохранены локально");
    };
    if (!isOwner()) return;

    $("addUser").onclick = () => {
      const id = $("newUid").value.trim();
      const name = $("newUname").value.trim() || id;
      if (!/^\d{5,15}$/.test(id)) return alert("Нужен числовой Telegram User ID");
      state.users[id] = { name, role: "trader", added: Date.now() };
      if (!state.allow.includes(id)) state.allow.push(id);
      save(); renderProfile();
    };
    $("screen-profile").querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      const id = b.dataset.del;
      delete state.users[id];
      state.allow = state.allow.filter(x => String(x) !== String(id));
      save(); renderProfile();
    });

    const showEd = (tab) => {
      $("edTabs").querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c.dataset.ed === tab));
      $("edCss").parentElement.classList.toggle("hidden", tab !== "css");
      $("wrapJs").classList.toggle("hidden", tab !== "js");
      $("wrapJson").classList.toggle("hidden", tab !== "json");
      if (tab === "json") $("edJson").value = JSON.stringify(state, null, 2);
    };
    $("edTabs").querySelectorAll(".chip").forEach(c => c.onclick = () => showEd(c.dataset.ed));
    $("applyEd").onclick = () => {
      state.customCss = $("edCss").value;
      state.customJs = $("edJs").value;
      if (!$("wrapJson").classList.contains("hidden")) {
        try { state = Object.assign(defaultState(), JSON.parse($("edJson").value)); } catch { return alert("JSON битый"); }
      }
      save(); applyCustom(); alert("Применено");
    };
    $("exportEd").onclick = () => download("po-academy-backup.json", JSON.stringify(state, null, 2));
    $("importEd").onclick = () => $("importFile").click();
    $("importFile").onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { state = Object.assign(defaultState(), JSON.parse(r.result)); save(); enterApp(); } catch { alert("Не удалось прочитать"); } };
      r.readAsText(f);
    };
  }

  /* ===== NEURO ===== */
  function renderNeuro() {
    $("screen-neuro").innerHTML = `
      <div class="card">
        <h2>Нейросеть</h2>
        <p class="muted">Прямой диалог. Ключ задаётся в профиле. Системный промпт — обучение трейдингу без гарантий дохода.</p>
        <div class="ai-log" id="aiLog"></div>
        <div class="chat-form">
          <input id="aiInput" placeholder="Спроси про паттерн, риск, M1...">
          <button class="btn primary" id="aiSend">Спросить</button>
        </div>
      </div>
      <div class="card">
        <h3>Сканер котировок</h3>
        <p class="muted">Не брокерский сигнал. Математика по синтетическому ряду: RSI, EMA, Stochastic, импульс тела свечи. Можно вставить последние close через запятую.</p>
        <div class="field"><label>Инструмент</label>
          <select id="scanAsset">
            <option>EUR/USD OTC</option><option>GBP/USD OTC</option><option>USD/JPY OTC</option>
            <option>BTC/USD</option><option>ETH/USD</option><option>GOLD OTC</option>
          </select>
        </div>
        <div class="field"><label>Ряд close (необязательно)</label>
          <input id="scanSeries" placeholder="1.0841, 1.0844, 1.0839 ...">
        </div>
        <button class="btn green full" id="runScan">Запустить расчёт</button>
        <div id="scanOut" style="margin-top:10px"></div>
      </div>
    `;
    $("aiSend").onclick = sendAI;
    $("aiInput").addEventListener("keydown", e => { if (e.key === "Enter") sendAI(); });
    $("runScan").onclick = runScan;
    pushAI("bot", "Я учебный ассистент. Могу разобрать паттерн, риск и математику калькулятора. Я не даю гарантию сделки.");
  }

  function pushAI(who, text) {
    const log = $("aiLog"); if (!log) return;
    const d = document.createElement("div");
    d.className = "msg" + (who === "me" ? " me" : "");
    d.innerHTML = `<div class="who">${who === "me" ? escapeHtml(currentUser.name) : "Нейросеть"}</div>${escapeHtml(text)}`;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  async function sendAI() {
    const q = $("aiInput").value.trim();
    if (!q) return;
    $("aiInput").value = "";
    pushAI("me", q);
    if (!state.api.key) {
      pushAI("bot", localTutor(q));
      return;
    }
    pushAI("bot", "Думаю...");
    try {
      const res = await fetch(state.api.base.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + state.api.key },
        body: JSON.stringify({
          model: state.api.model || "gpt-4o-mini",
          messages: [
            { role: "system", content: "Ты учебный тренер по краткосрочному трейдингу и бинарным опционам. Объясняй паттерны, риск, математику Мартингейла и почему стратегия может не сработать. Запрещено обещать прибыль и давать «100% сигналы». Отвечай по-русски коротко и ясно." },
            { role: "user", content: q }
          ],
          temperature: 0.4
        })
      });
      const data = await res.json();
      const text = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : (data.error && data.error.message) || "Нет ответа";
      $("aiLog").lastChild.remove();
      pushAI("bot", text);
    } catch (e) {
      $("aiLog").lastChild.remove();
      pushAI("bot", "Сеть/ключ недоступны. Локальный ответ:\n" + localTutor(q));
    }
  }

  function localTutor(q) {
    const s = q.toLowerCase();
    if (s.includes("мартин")) return "Мартингейл удваивает ставку после проигрыша. Даже при винрейте 55% серия из 6–8 лосей уничтожает банк. Считайте максимальное число шагов так, чтобы суммарная нагрузка ≤ 5–10% депозита.";
    if (s.includes("молот") || s.includes("hammer")) return "Молот работает только внизу движения и после закрытия. На M1 без уровня это часто просто шум.";
    if (s.includes("rsi")) return "RSI < 30 не равен CALL. В тренде вниз RSI может жить в перепроданности. Нужно совпадение с уровнем или сменой структуры.";
    return "Сформулируй конкретнее: паттерн, индикатор, риск или расчёт банка. Без ключа ИИ я отвечаю встроенным учебным модулем.";
  }

  function runScan() {
    const raw = $("scanSeries").value.trim();
    let closes;
    if (raw) {
      closes = raw.split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0);
    }
    if (!closes || closes.length < 30) closes = synthCloses(80);
    const candles = closesToCandles(closes);
    const rsi = last(rsiArr(closes, 14));
    const ema9 = last(ema(closes, 9));
    const ema21 = last(ema(closes, 21));
    const stoch = last(stochK(closes, 14));
    const mom = (closes[closes.length - 1] - closes[closes.length - 6]) / closes[closes.length - 6] * 100;
    const body = candleBodyScore(candles[candles.length - 1]);

    let score = 0;
    if (ema9 > ema21) score += 1.2; else score -= 1.2;
    if (rsi >= 55) score += 0.8; else if (rsi <= 45) score -= 0.8;
    if (stoch >= 60) score += 0.5; else if (stoch <= 40) score -= 0.5;
    if (mom > 0.04) score += 0.6; else if (mom < -0.04) score -= 0.6;
    score += body;

    let side = "WAIT", conf = Math.min(92, Math.round(50 + Math.abs(score) * 14));
    if (score >= 1.3) side = "CALL";
    else if (score <= -1.3) side = "PUT";
    else conf = Math.min(conf, 48);

    $("scanOut").innerHTML = `
      <div class="candles" style="height:110px">${renderCandles(candles.slice(-24))}</div>
      <div class="scan-result" style="margin-top:8px">
        <div class="kpi"><span class="muted">Идея</span><b class="${side === "CALL" ? "badge call" : side === "PUT" ? "badge put" : "badge wait"}">${side}</b></div>
        <div class="kpi"><span class="muted">Уверенность модели</span><b>${conf}%</b></div>
        <div class="kpi"><span class="muted">RSI(14)</span><b>${rsi.toFixed(1)}</b></div>
        <div class="kpi"><span class="muted">EMA9 / EMA21</span><b>${ema9.toFixed(5)} / ${ema21.toFixed(5)}</b></div>
        <div class="kpi"><span class="muted">Stoch %K</span><b>${stoch.toFixed(1)}</b></div>
        <div class="kpi"><span class="muted">Импульс 5</span><b>${mom.toFixed(3)}%</b></div>
      </div>
      <p class="muted" style="margin-top:8px">Формула: sign(EMA9-EMA21)*1.2 + RSI-фильтр + Stoch + momentum + направление тела. Это учебный скоринг, не котировка Pocket Option в реальном времени.</p>
    `;
  }

  function synthCloses(n) {
    const out = []; let p = 1.08 + Math.random() * 0.02;
    for (let i = 0; i < n; i++) { p *= 1 + (Math.random() - 0.49) * 0.0024; out.push(+p.toFixed(5)); }
    return out;
  }
  function closesToCandles(closes) {
    return closes.map((c, i) => {
      const prev = i ? closes[i - 1] : c;
      const o = prev;
      const noise = c * 0.0006;
      const h = Math.max(o, c) + Math.random() * noise;
      const l = Math.min(o, c) - Math.random() * noise;
      return { o, h, l, c };
    });
  }
  function ema(arr, len) {
    const k = 2 / (len + 1); const out = []; let prev = arr[0];
    arr.forEach((x, i) => { prev = i ? x * k + prev * (1 - k) : x; out.push(prev); });
    return out;
  }
  function rsiArr(arr, len) {
    const out = Array(arr.length).fill(50);
    let g = 0, l = 0;
    for (let i = 1; i <= len; i++) { const d = arr[i] - arr[i - 1]; if (d >= 0) g += d; else l -= d; }
    let ag = g / len, al = l / len;
    out[len] = 100 - 100 / (1 + (al === 0 ? 100 : ag / al));
    for (let i = len + 1; i < arr.length; i++) {
      const d = arr[i] - arr[i - 1];
      ag = (ag * (len - 1) + Math.max(d, 0)) / len;
      al = (al * (len - 1) + Math.max(-d, 0)) / len;
      out[i] = 100 - 100 / (1 + (al === 0 ? 100 : ag / al));
    }
    return out;
  }
  function stochK(arr, len) {
    return arr.map((_, i) => {
      const sl = arr.slice(Math.max(0, i - len + 1), i + 1);
      const mn = Math.min(...sl), mx = Math.max(...sl);
      return mx === mn ? 50 : (arr[i] - mn) / (mx - mn) * 100;
    });
  }
  function candleBodyScore(c) {
    const range = c.h - c.l || 1e-9;
    const body = c.c - c.o;
    return Math.max(-0.8, Math.min(0.8, (body / range) * 0.8));
  }
  function last(a) { return a[a.length - 1]; }

  /* ===== KNOWLEDGE / VIDEO ===== */
  function renderKnowledge() {
    const books = (state.books || []).map(b => `
      <div class="card">
        <h3>${escapeHtml(b.title)}</h3>
        <p class="muted">${escapeHtml(b.author || "")}</p>
        <p>${escapeHtml(b.note || "")}</p>
        ${b.url ? `<a class="btn" style="display:inline-block;margin-top:8px;text-decoration:none" href="${escapeAttr(b.url)}" target="_blank" rel="noopener">Открыть материал</a>` : ""}
        ${isOwner() ? `<button class="btn ghost" data-delb="${b.id}">Удалить</button>` : ""}
      </div>`).join("");
    const videos = (state.videos || []).map(v => `
      <div class="card">
        <h3>${escapeHtml(v.title)}</h3>
        <iframe class="video-frame" src="${escapeAttr(toEmbed(v.url))}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        ${isOwner() ? `<button class="btn ghost" data-delv="${v.id}" style="margin-top:8px">Удалить видео</button>` : ""}
      </div>`).join("");

    $("screen-learn").innerHTML = `
      <div class="subnav">
        <button class="chip on" data-tab="books">Книги</button>
        <button class="chip" data-tab="videos">Видео</button>
      </div>
      <div id="learnBooks">${books || "<div class='card muted'>Пока пусто</div>"}
        ${isOwner() ? `<div class="card"><h3>Добавить книгу</h3>
          <div class="field"><label>Название</label><input id="bkTitle"></div>
          <div class="field"><label>Автор</label><input id="bkAuthor"></div>
          <div class="field"><label>Заметка</label><input id="bkNote"></div>
          <div class="field"><label>Ссылка</label><input id="bkUrl" placeholder="https://"></div>
          <button class="btn primary" id="addBk">Добавить</button></div>` : ""}
      </div>
      <div id="learnVideos" class="hidden">${videos || "<div class='card muted'>Нет видео</div>"}
        ${isOwner() ? `<div class="card"><h3>Вставить видео</h3>
          <p class="muted">YouTube ссылка или embed. Видео смотрится прямо в Mini App.</p>
          <div class="field"><label>Название</label><input id="vidTitle"></div>
          <div class="field"><label>URL</label><input id="vidUrl" placeholder="https://youtu.be/..."></div>
          <button class="btn primary" id="addVid">Добавить видео</button></div>` : ""}
      </div>
    `;
    const booksEl = $("learnBooks"), vidsEl = $("learnVideos");
    $("screen-learn").querySelectorAll(".subnav .chip").forEach(ch => ch.onclick = () => {
      $("screen-learn").querySelectorAll(".subnav .chip").forEach(x => x.classList.remove("on"));
      ch.classList.add("on");
      booksEl.classList.toggle("hidden", ch.dataset.tab !== "books");
      vidsEl.classList.toggle("hidden", ch.dataset.tab !== "videos");
    });
    if (isOwner()) {
      $("addBk") && ($("addBk").onclick = () => {
        state.books.push({ id: "b" + Date.now(), title: $("bkTitle").value || "Материал", author: $("bkAuthor").value, note: $("bkNote").value, url: $("bkUrl").value });
        save(); renderKnowledge();
      });
      $("addVid") && ($("addVid").onclick = () => {
        state.videos.push({ id: "v" + Date.now(), title: $("vidTitle").value || "Видео", url: $("vidUrl").value });
        save(); renderKnowledge();
      });
      $("screen-learn").querySelectorAll("[data-delb]").forEach(b => b.onclick = () => { state.books = state.books.filter(x => x.id !== b.dataset.delb); save(); renderKnowledge(); });
      $("screen-learn").querySelectorAll("[data-delv]").forEach(b => b.onclick = () => { state.videos = state.videos.filter(x => x.id !== b.dataset.delv); save(); renderKnowledge(); });
    }
  }

  function toEmbed(url) {
    if (!url) return "";
    const m = String(url).match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{6,})/);
    if (m) return "https://www.youtube.com/embed/" + m[1];
    return url;
  }

  /* ===== PATTERNS ===== */
  function renderPatterns() {
    const list = PO_DATA.patterns.map(p => `
      <div class="card pattern-card" data-pid="${p.id}">
        <div class="row" style="justify-content:space-between">
          <h3>${p.id}. ${escapeHtml(p.name)}</h3>
          <span class="badge ${p.type === "CALL" ? "call" : p.type === "PUT" ? "put" : "wait"}">${p.type}</span>
        </div>
        <div class="candles">${renderCandles(p.candles)}</div>
        <p class="muted">${escapeHtml(p.kind)}</p>
      </div>`).join("");
    $("screen-patterns").innerHTML = `
      <div class="card"><h2>Паттерны</h2><p class="muted">${PO_DATA.patterns.length} моделей в стиле свечного терминала. Нажми карточку — полное объяснение.</p></div>
      ${list}
      <div class="card hidden" id="patModal"></div>
    `;
    $("screen-patterns").querySelectorAll("[data-pid]").forEach(card => card.onclick = () => {
      const p = PO_DATA.patterns.find(x => String(x.id) === card.dataset.pid);
      $("patModal").classList.remove("hidden");
      $("patModal").innerHTML = `<h3>${escapeHtml(p.name)}</h3>
        <div class="candles" style="height:120px">${renderCandles(p.candles, 14)}</div>
        <p>${escapeHtml(p.text)}</p>
        <p class="muted" style="margin-top:8px">Тип: ${p.kind}. Учебная метка: ${p.type}. На M1 паттерн без уровня и без закрытия свечи не торгуется.</p>`;
      $("patModal").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function renderCandles(arr, w = 10) {
    const highs = arr.map(c => c.h), lows = arr.map(c => c.l);
    const max = Math.max(...highs), min = Math.min(...lows);
    const span = max - min || 1;
    const H = 90;
    return arr.map(c => {
      const up = c.c >= c.o;
      const top = Math.max(c.o, c.c), bot = Math.min(c.o, c.c);
      const yH = (max - c.h) / span * H;
      const yL = (max - c.l) / span * H;
      const yT = (max - top) / span * H;
      const yB = (max - bot) / span * H;
      const bodyH = Math.max(2, yB - yT);
      const doji = Math.abs(c.c - c.o) / span < 0.03;
      return `<div class="candle ${doji ? "doji" : up ? "up" : "down"}" style="width:${w}px;height:${H}px">
        <div class="wick" style="top:${yH}px;height:${Math.max(2, yL - yH)}px"></div>
        <div class="body" style="top:${yT}px;height:${bodyH}px"></div>
      </div>`;
    }).join("");
  }

  /* ===== STRATEGIES ===== */
  function renderStrategies() {
    $("screen-strategies").innerHTML = PO_DATA.strategies.map(s => `
      <div class="card">
        <h3>${escapeHtml(s.name)}</h3>
        <div class="chips">${s.indicators.map(i => `<span class="chip on">${escapeHtml(i)}</span>`).join("")}<span class="chip">${s.tf}</span></div>
        <p style="margin:8px 0">${escapeHtml(s.rules)}</p>
        <p class="muted">${escapeHtml(s.risk)}</p>
      </div>`).join("");
  }

  /* ===== CALCULATOR ===== */
  function renderCalc() {
    $("screen-calc").innerHTML = `
      <div class="card">
        <h2>Калькулятор</h2>
        <p class="muted">Любая сумма и любой процент, включая 0.01%. Полный недельный разбор + Мартингейл.</p>
        <div class="grid grid-2">
          <div class="field"><label>Депозит</label><input id="cDep" type="number" value="1000" min="1" step="0.01"></div>
          <div class="field"><label>% от депозита на первую сделку</label><input id="cPct" type="number" value="1" min="0.0001" step="0.0001"></div>
          <div class="field"><label>Фикс. сумма первой сделки (0 = от %)</label><input id="cFix" type="number" value="0" min="0" step="0.01"></div>
          <div class="field"><label>Выплата брокера, %</label><input id="cPay" type="number" value="92" min="1" step="0.01"></div>
          <div class="field"><label>% прибыльных сделок (винрейт)</label><input id="cWr" type="number" value="55" min="1" max="99" step="0.1"></div>
          <div class="field"><label>Сделок в день</label><input id="cDay" type="number" value="10" min="1" step="1"></div>
          <div class="field"><label>Дней в неделе</label><input id="cDays" type="number" value="5" min="1" max="7"></div>
          <div class="field"><label>Шагов Мартингейла</label><input id="cSteps" type="number" value="4" min="1" max="12"></div>
          <div class="field"><label>Множитель после лося</label><input id="cMul" type="number" value="2.2" min="1" step="0.01"></div>
        </div>
        <button class="btn primary full" id="cRun">Рассчитать неделю</button>
      </div>
      <div id="cOut"></div>
    `;
    $("cRun").onclick = calcWeek;
  }

  function calcWeek() {
    const dep0 = num("cDep"), pct = num("cPct"), fix = num("cFix");
    const pay = num("cPay") / 100, wr = num("cWr") / 100;
    const perDay = Math.max(1, Math.floor(num("cDay")));
    const days = Math.max(1, Math.floor(num("cDays")));
    const steps = Math.max(1, Math.floor(num("cSteps")));
    const mul = num("cMul");
    const first = fix > 0 ? fix : dep0 * (pct / 100);
    if (!(dep0 > 0) || !(first > 0)) return alert("Проверьте депозит и процент");

    const series = [];
    let s = first;
    for (let i = 0; i < steps; i++) { series.push(s); s *= mul; }
    const maxLoad = series.reduce((a, b) => a + b, 0);

    const evOne = wr * first * pay - (1 - wr) * first;
    const trades = perDay * days;
    const expWeek = evOne * trades;
    const winTrades = trades * wr;
    const loseTrades = trades * (1 - wr);
    const grossWin = winTrades * first * pay;
    const grossLose = loseTrades * first;
    const netFlat = grossWin - grossLose;

    let rows = "";
    let bank = dep0;
    for (let d = 1; d <= days; d++) {
      const dayNet = evOne * perDay;
      bank += dayNet;
      rows += `<tr><td>День ${d}</td><td>${perDay}</td><td>${fmt(dayNet)}</td><td>${fmt(bank)}</td></tr>`;
    }

    const helper = martingaleHelp(dep0, first, series, wr, pay, perDay);

    $("cOut").innerHTML = `
      <div class="card">
        <div class="scan-result">
          <div class="kpi"><span class="muted">Первая сделка</span><b>${fmt(first)}</b></div>
          <div class="kpi"><span class="muted">Матожидание 1 сделки</span><b>${fmt(evOne)}</b></div>
          <div class="kpi"><span class="muted">Сделок за неделю</span><b>${trades}</b></div>
          <div class="kpi"><span class="muted">Ожидание недели (без мартина)</span><b>${fmt(netFlat)}</b></div>
        </div>
        <p class="muted" style="margin-top:8px">EV = WR × ставка × выплата − (1−WR) × ставка. При выплате ${num("cPay")}% безубыточный винрейт ≈ ${(100 / (1 + pay)).toFixed(2)}%.</p>
      </div>
      <div class="card">
        <h3>Лестница Мартингейла</h3>
        <table><thead><tr><th>Шаг</th><th>Ставка</th><th>Нужно вернуть</th><th>% банка</th></tr></thead>
        <tbody>${series.map((v, i) => {
          const need = series.slice(0, i + 1).reduce((a, b) => a + b, 0);
          return `<tr><td>${i + 1}</td><td>${fmt(v)}</td><td>${fmt(need)}</td><td>${((v / dep0) * 100).toFixed(3)}%</td></tr>`;
        }).join("")}</tbody></table>
        <p class="muted">Сумма всех шагов: ${fmt(maxLoad)} (${((maxLoad / dep0) * 100).toFixed(2)}% депозита). Если это больше 10% — лестница опасна.</p>
      </div>
      <div class="card">
        <h3>План на неделю (модель плоской ставки)</h3>
        <table><thead><tr><th>День</th><th>Сделок</th><th>Ожидание</th><th>Банк</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="card">
        <h3>Помощник ИИ по плану</h3>
        <p>${helper}</p>
        <button class="btn" id="askPlan">Спросить нейросеть про этот план</button>
      </div>
    `;
    $("askPlan").onclick = () => {
      showScreen("screen-neuro");
      $("aiInput").value = `Разбери риск плана: депозит ${dep0}, ставка ${first}, выплата ${num("cPay")}%, винрейт ${num("cWr")}%, ${perDay} сделок/день, мартин ${steps} шагов x${mul}.`;
    };
  }

  function martingaleHelp(dep, first, series, wr, pay, perDay) {
    const load = series.reduce((a, b) => a + b, 0);
    const be = 1 / (1 + pay);
    const pRuinStep = Math.pow(1 - wr, series.length);
    let msg = `Безубыточный винрейт при выплате ${(pay * 100).toFixed(1)}% равен ${(be * 100).toFixed(2)}%. Ваш заданный винрейт ${(wr * 100).toFixed(1)}% ${wr > be ? "выше" : "ниже"} этой отметки. `;
    msg += `Вероятность полной серии из ${series.length} убытков подряд ≈ ${(pRuinStep * 100).toFixed(3)}% на каждую попытку лестницы. `;
    msg += `Нагрузка лестницы ${((load / dep) * 100).toFixed(2)}% банка. `;
    msg += load / dep > 0.15
      ? "Это слишком тяжёлый Мартингейл: одна серия лосей съедает заметную долю депозита."
      : "Лестница относительно короткая, но Мартингейл всё равно не делает винрейт выше.";
    msg += ` Практический лимит: не больше ${Math.max(2, Math.min(6, Math.round(perDay / 3)))} серий в день и стоп-день после 2 полных лесенок.`;
    return msg;
  }

  /* ===== CALENDAR + NEWS ===== */
  function sampleNews() {
    const topics = [
      ["USD", "Публикация инфляционных ожиданий, возможны импульсы по USD-парам"],
      ["EUR", "Комментарии ЕЦБ. Осторожно с EUR/USD OTC в минуту релиза"],
      ["GBP", "Риторика Банка Англии. Широкий спред на M1"],
      ["XAU", "Золото чувствительно к реальной ставке и доллару"],
      ["BTC", "Критптоволатильность вне макро — не путать с форекс-новостью"],
      ["US", "Открытие Америки: рост диапазона на M1"],
      ["Oil", "Нефть: следить за геополитическим заголовком, не за слухом в чате"]
    ];
    const out = {};
    const now = new Date();
    for (let i = -2; i < 12; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i);
      const key = isoDay(d);
      const n = 2 + ((d.getDate() + i) % 3);
      out[key] = Array.from({ length: n }, (_, k) => {
        const t = topics[(d.getDate() + k + i + 7) % topics.length];
        return { time: `${8 + ((k * 3 + d.getDate()) % 10)}:${k % 2 ? "00" : "30"}`, tag: t[0], title: t[1], src: k % 2 ? "AI brief" : "Macro desk" };
      });
    }
    return out;
  }

  let NEWS = sampleNews();
  let selectedDay = isoDay(new Date());

  function renderCalendar() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const first = new Date(y, m, 1).getDay();
    const shift = (first + 6) % 7;
    const dim = new Date(y, m + 1, 0).getDate();
    let cells = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(h => `<div class="h">${h}</div>`).join("");
    for (let i = 0; i < shift; i++) cells += `<div></div>`;
    for (let d = 1; d <= dim; d++) {
      const key = `${y}-${pad(m + 1)}-${pad(d)}`;
      const has = NEWS[key] && NEWS[key].length;
      cells += `<div class="d ${key === selectedDay ? "on" : ""} ${has ? "has" : ""}" data-day="${key}">${d}</div>`;
    }
    $("screen-calendar").innerHTML = `
      <div class="card">
        <h2>Календарь</h2>
        <p class="muted">${now.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}. Нажми день — новости сразу под сеткой.</p>
        <div class="cal">${cells}</div>
      </div>
      <div class="card" id="dayNews"></div>
    `;
    paintDayNews(selectedDay);
    $("screen-calendar").querySelectorAll("[data-day]").forEach(el => el.onclick = () => {
      selectedDay = el.dataset.day;
      renderCalendar();
    });
  }

  function paintDayNews(day) {
    const items = (NEWS[day] || []).concat(state.newsExtra.filter(n => n.day === day));
    $("dayNews").innerHTML = `<h3>Новости ${day}</h3>` + (items.length ? items.map(n => `
      <div class="user-item"><div><b>${escapeHtml(n.time || "")} · ${escapeHtml(n.tag || "NEWS")}</b><div class="muted">${escapeHtml(n.title)}</div></div><span class="chip">${escapeHtml(n.src || "")}</span></div>
    `).join("") : `<p class="muted">На этот день лента пустая. Открой раздел «Новости» для общей подборки.</p>`);
  }

  function renderNews() {
    const all = [];
    Object.keys(NEWS).sort().forEach(day => NEWS[day].forEach(n => all.push(Object.assign({ day }, n))));
    state.newsExtra.forEach(n => all.push(n));
    all.sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
    $("screen-news").innerHTML = `
      <div class="card">
        <h2>Новости</h2>
        <p class="muted">Лента макро + учебный AI-brief. Виджет TradingView ниже. Хозяин может добавить свой заголовок.</p>
      </div>
      ${isOwner() ? `<div class="card"><h3>Добавить новость</h3>
        <div class="grid grid-2">
          <div class="field"><label>Дата YYYY-MM-DD</label><input id="nDay" value="${isoDay(new Date())}"></div>
          <div class="field"><label>Время</label><input id="nTime" value="12:00"></div>
        </div>
        <div class="field"><label>Заголовок</label><input id="nTitle"></div>
        <div class="field"><label>Источник</label><input id="nSrc" value="Owner"></div>
        <button class="btn primary" id="addNews">Опубликовать</button>
      </div>` : ""}
      <div class="card">
        <h3>TradingView timeline</h3>
        <iframe class="video-frame" style="height:420px;aspect-ratio:auto" src="https://s.tradingview.com/embed-widget/timeline/?locale=ru#%7B%22colorTheme%22%3A%22dark%22%2C%22isTransparent%22%3Atrue%2C%22displayMode%22%3A%22regular%22%2C%22width%22%3A%22100%25%22%2C%22height%22%3A420%7D"></iframe>
      </div>
      ${all.slice(-40).reverse().map(n => `
        <div class="card"><div class="row" style="justify-content:space-between"><b>${escapeHtml(n.day)} ${escapeHtml(n.time || "")}</b><span class="chip">${escapeHtml(n.src || n.tag || "")}</span></div><p>${escapeHtml(n.title)}</p></div>
      `).join("")}
    `;
    if (isOwner() && $("addNews")) {
      $("addNews").onclick = () => {
        state.newsExtra.push({ day: $("nDay").value, time: $("nTime").value, title: $("nTitle").value, src: $("nSrc").value, tag: "OWNER" });
        save(); renderNews(); renderCalendar();
      };
    }
  }

  /* ===== CHAT ===== */
  function renderChat() {
    $("screen-chat").innerHTML = `
      <div class="card">
        <h2>Чат трейдеров</h2>
        <p class="muted">Пишут только добавленные ID. Имя подсвечивается: Антон, Валера, Андрей — как внесены хозяином.</p>
        <div class="chat-box" id="chatBox"></div>
        <div class="chat-form">
          <input id="chatInp" placeholder="Сообщение...">
          <button class="btn primary" id="chatSend">Отправить</button>
        </div>
      </div>
    `;
    paintChat();
    $("chatSend").onclick = sendChat;
    $("chatInp").addEventListener("keydown", e => { if (e.key === "Enter") sendChat(); });
  }

  function paintChat() {
    const box = $("chatBox"); if (!box) return;
    const colors = ["#33a5fb", "#17c964", "#f5c14a", "#ff8a3d", "#c084fc", "#f31260"];
    box.innerHTML = (state.chat || []).map(m => {
      const known = state.users[m.id];
      const name = (known && known.name) || m.name || m.id;
      const col = colors[Math.abs(hash(String(m.id))) % colors.length];
      return `<div class="msg ${m.id === currentUser.id ? "me" : ""}"><div class="who" style="color:${col}">${escapeHtml(name)}</div>${escapeHtml(m.text)}<div class="muted">${new Date(m.t).toLocaleTimeString("ru-RU")}</div></div>`;
    }).join("") || `<p class="muted">Пока тихо. Напишите первый комментарий по рынку.</p>`;
    box.scrollTop = box.scrollHeight;
  }

  function sendChat() {
    const text = $("chatInp").value.trim();
    if (!text) return;
    if (!isAllowed()) return alert("Нет доступа к чату");
    state.chat.push({ id: currentUser.id, name: (state.users[currentUser.id] && state.users[currentUser.id].name) || currentUser.name, text, t: Date.now() });
    if (state.chat.length > 300) state.chat = state.chat.slice(-300);
    $("chatInp").value = "";
    save(); paintChat();
  }

  /* ===== helpers ===== */
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/`/g, ""); }
  function num(id) { return Number($(id).value); }
  function fmt(n) { return (Math.round(n * 100) / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function isoDay(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = name; a.click();
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav button");
    if (btn && btn.dataset.go) showScreen(btn.dataset.go);
  });

  detectUser();
  clocks();
  setInterval(clocks, 1000);
  setInterval(heartbeat, 20000);

  if (!isAllowed() || (!tg && currentUser.id === "guest" && !state.ownerId) || (state.ownerId && !isAllowed()) || !state.ownerId) {
    if (state.ownerId && isAllowed()) enterApp();
    else renderGate();
  } else enterApp();
})();
