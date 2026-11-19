/* =========================================================
   Invitación de graduación · Eitan Josias López Corazón
   Sin frameworks. Las confirmaciones se guardan en Google Sheets.
   ========================================================= */

const CONFIG = {
  // Pegue aquí la URL de la "Aplicación web" de Google Apps Script (termina en /exec).
  // Mientras esté vacía, el formulario funciona en MODO DE PRUEBA y no guarda nada.
  ENDPOINT: 'https://script.google.com/macros/s/AKfycbyPwvIG3KISD7oXaWkMi7xLpuO3emMZNjTOOSLDm0xe2Y4NQFlae7GZd5MF0swSNaWA/exec',

  // Fechas con zona horaria de Guatemala (-06:00)
  EVENTO_INICIO: '2026-12-05T18:00:00-06:00',
  EVENTO_FIN:    '2026-12-05T22:00:00-06:00', // solo se usa para el calendario
  FECHA_LIMITE:  '2026-11-28T23:59:59-06:00',

  // true = después de la fecha límite el formulario se cierra y se muestra el WhatsApp
  CERRAR_AL_VENCER: false,

  // true = muestra la entrada con el sobre; false = abre directo la invitación
  ENTRADA_SOBRE: true,

  // Música de fondo. Empieza al abrir el sobre (los navegadores no dejan que suene sola).
  // inicio = segundo desde el que arranca; volumen de 0 a 1 (el iPhone ignora el volumen).
  // Para quitarla: MUSICA: null
  MUSICA: { archivo: 'corazon-de-nino.mp3', inicio: 0, volumen: 0.55 },

  WHATSAPP: '50242894557',
  MAPS: 'https://maps.app.goo.gl/nNvKW8VQEfgJ6L958',

  EVENTO: {
    titulo: 'Graduación de Eitan Josias López Corazón',
    lugar: 'Café Moka, Aldea Palimonix, Rabinal, Baja Verapaz',
  },

  MAX_PERSONAS: 30,
  STORAGE_KEY: 'graduacion-eitan-rsvp',
};

(function () {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const storage = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* sin almacenamiento */ } },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* sin almacenamiento */ } },
  };

  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cleanText = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  /* ---------------------------------------------------------
     0. Música de fondo
     --------------------------------------------------------- */
  function initMusic() {
    const audio = $('#bgMusic');
    const btn = $('#musicBtn');
    const cfg = CONFIG.MUSICA;
    const none = { start() {}, startOnFirstTap() {} };

    if (!audio || !btn || !cfg || !cfg.archivo) {
      if (audio) audio.remove();
      if (btn) btn.remove();
      return none;
    }

    // "#t=15" hace que la canción arranque en ese segundo
    audio.src = cfg.archivo + (cfg.inicio ? `#t=${cfg.inicio}` : '');
    const target = Math.min(Math.max(Number(cfg.volumen) || 0.55, 0), 1);
    let userPaused = false;   // la persona la pausó con el botón
    let pausedByHide = false; // se pausó porque cambió de app o pestaña
    let fadeTimer;

    const setUI = (playing) => {
      btn.classList.toggle('is-playing', playing);
      btn.setAttribute('aria-pressed', String(playing));
      btn.setAttribute('aria-label', playing ? 'Pausar la música' : 'Reproducir la música');
    };
    audio.addEventListener('play', () => setUI(true));
    audio.addEventListener('pause', () => setUI(false));

    const fadeIn = () => {
      clearInterval(fadeTimer);
      try { audio.volume = 0; } catch (e) { return; }
      fadeTimer = setInterval(() => {
        const v = Math.min(audio.volume + target / 20, target);
        audio.volume = v;
        if (v >= target) clearInterval(fadeTimer);
      }, 100);
    };

    const play = () => {
      fadeIn();
      const p = audio.play();
      if (p && p.catch) p.catch(() => setUI(false)); // el navegador la bloqueó: queda el botón
    };

    btn.addEventListener('click', () => {
      if (audio.paused) { userPaused = false; play(); }
      else { userPaused = true; audio.pause(); }
    });

    // Pausar al salir a otra app o pestaña (abrir Maps, WhatsApp…) y reanudar al volver
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !audio.paused) { pausedByHide = true; audio.pause(); }
      else if (!document.hidden && pausedByHide && !userPaused) { pausedByHide = false; play(); }
    });

    return {
      // Se llama dentro del toque al sobre (así el navegador la deja sonar)
      start() {
        btn.hidden = false;
        if (!userPaused) play();
      },
      // Sin sobre: arranca con el primer toque en la página
      startOnFirstTap() {
        btn.hidden = false;
        const once = (e) => {
          document.removeEventListener('click', once, true);
          document.removeEventListener('keydown', once, true);
          if (btn.contains(e.target)) return; // el botón ya se encarga
          if (!userPaused && audio.paused) play();
        };
        document.addEventListener('click', once, true);
        document.addEventListener('keydown', once, true);
      },
    };
  }

  /* ---------------------------------------------------------
     1. Entrada con sobre
     --------------------------------------------------------- */
  function initIntro(music) {
    const intro = $('#intro');
    const html = document.documentElement;
    const done = () => {
      html.classList.remove('intro-active');
      if (intro) intro.remove();
      startReveals();
      music.startOnFirstTap();
    };

    if (!intro || !CONFIG.ENTRADA_SOBRE) { done(); return; }

    const btn = $('#envelopeBtn');
    let opened = false;

    const open = () => {
      if (opened) return;
      opened = true;
      music.start(); // debe ir aquí, dentro del toque, o el navegador bloquea el sonido
      intro.classList.add('is-open');
      const t1 = reduceMotion ? 250 : 1650;
      const t2 = reduceMotion ? 300 : 800;
      setTimeout(() => {
        intro.classList.add('is-leaving');
        html.classList.remove('intro-active');
        startReveals();
        setTimeout(() => {
          intro.remove();
          const title = $('#inicio');
          if (title) title.focus({ preventScroll: true });
        }, t2);
      }, t1);
    };

    btn.addEventListener('click', open);
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter') {
        document.removeEventListener('keydown', onKey);
        open();
      }
    });
    // Permite tocar en cualquier parte de la pantalla de entrada
    intro.addEventListener('click', (e) => { if (e.target === intro || e.target.closest('.intro__inner')) open(); });
  }

  /* ---------------------------------------------------------
     2. Animaciones al bajar
     --------------------------------------------------------- */
  let revealsStarted = false;
  function startReveals() {
    if (revealsStarted) return;
    revealsStarted = true;
    const items = $$('.reveal');

    // Escalonar los elementos que comparten sección
    const groups = new Map();
    items.forEach((el) => {
      const parent = el.closest('section, header, aside') || document.body;
      const idx = groups.get(parent) || 0;
      el.style.setProperty('--d', `${Math.min(idx * 0.09, 0.5)}s`);
      groups.set(parent, idx + 1);
    });

    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach((el) => io.observe(el));
  }

  /* ---------------------------------------------------------
     3. Cuenta regresiva
     --------------------------------------------------------- */
  function initCountdown() {
    const box = $('#countdown');
    if (!box) return;
    const target = new Date(CONFIG.EVENTO_INICIO).getTime();
    const end = new Date(CONFIG.EVENTO_FIN).getTime();
    const cells = { d: $('[data-cd="d"]', box), h: $('[data-cd="h"]', box), m: $('[data-cd="m"]', box), s: $('[data-cd="s"]', box) };
    const title = $('#countdownTitle');
    const pad = (n) => String(n).padStart(2, '0');
    let timer;

    const tick = () => {
      const now = Date.now();
      let diff = target - now;
      if (diff <= 0) {
        box.classList.add('is-over');
        title.textContent = now < end ? '¡Hoy es el gran día!' : '¡Gracias por acompañarme!';
        clearInterval(timer);
        return;
      }
      const d = Math.floor(diff / 86400000); diff -= d * 86400000;
      const h = Math.floor(diff / 3600000); diff -= h * 3600000;
      const m = Math.floor(diff / 60000); diff -= m * 60000;
      const s = Math.floor(diff / 1000);
      cells.d.textContent = pad(d);
      cells.h.textContent = pad(h);
      cells.m.textContent = pad(m);
      cells.s.textContent = pad(s);
      title.textContent = d === 0 ? 'Falta muy poco' : 'Faltan';
    };
    tick();
    timer = setInterval(tick, 1000);
  }

  /* ---------------------------------------------------------
     4. Calendario (Google y .ics)
     --------------------------------------------------------- */
  function toUTCStamp(iso) {
    return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function initCalendar() {
    const start = toUTCStamp(CONFIG.EVENTO_INICIO);
    const end = toUTCStamp(CONFIG.EVENTO_FIN);
    const details = `Ubicación en Google Maps: ${CONFIG.MAPS}`;

    const gcal = $('#gcalLink');
    if (gcal) {
      const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: CONFIG.EVENTO.titulo,
        dates: `${start}/${end}`,
        location: CONFIG.EVENTO.lugar,
        details,
        ctz: 'America/Guatemala',
      });
      gcal.href = `https://calendar.google.com/calendar/render?${params.toString()}`;
    }

    const icsBtn = $('#icsBtn');
    if (icsBtn) {
      icsBtn.addEventListener('click', () => {
        const esc = (s) => s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
        const ics = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//Graduacion Eitan//ES',
          'CALSCALE:GREGORIAN',
          'METHOD:PUBLISH',
          'BEGIN:VEVENT',
          `UID:graduacion-eitan-20261205@invitacion`,
          `DTSTAMP:${toUTCStamp(new Date().toISOString())}`,
          `DTSTART:${start}`,
          `DTEND:${end}`,
          `SUMMARY:${esc(CONFIG.EVENTO.titulo)}`,
          `LOCATION:${esc(CONFIG.EVENTO.lugar)}`,
          `DESCRIPTION:${esc(details)}`,
          `URL:${CONFIG.MAPS}`,
          'BEGIN:VALARM',
          'TRIGGER:-PT3H',
          'ACTION:DISPLAY',
          'DESCRIPTION:Graduación de Eitan',
          'END:VALARM',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n');
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Graduacion-Eitan.ics';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        closeCalMenu();
      });
    }

    const menu = $('#calMenu');
    function closeCalMenu() { if (menu) menu.open = false; }
    if (menu) {
      document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) closeCalMenu(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCalMenu(); });
      if (gcal) gcal.addEventListener('click', () => setTimeout(closeCalMenu, 100));
    }
  }

  /* ---------------------------------------------------------
     5. Formulario de confirmación
     --------------------------------------------------------- */
  function initRSVP() {
    const form = $('#rsvpForm');
    if (!form) return;

    const yesBlock = $('#yesBlock');
    const noBlock = $('#noBlock');
    const commonBlock = $('#commonBlock');
    const list = $('#peopleList');
    const tpl = $('#personTpl');
    const addBtn = $('#addPerson');
    const tally = $('#tally');
    const phone = $('#telefono');
    const nameNo = $('#nombreNo');
    const message = $('#mensaje');
    const submitBtn = $('#submitBtn');
    const status = $('#formStatus');
    const doneBox = $('#rsvpDone');
    const closedBox = $('#rsvpClosed');
    let uid = 0;

    // Aviso de modo de prueba
    if (!CONFIG.ENDPOINT) {
      const note = document.createElement('p');
      note.className = 'demo-note';
      note.textContent = 'Modo de prueba: las respuestas todavía no se guardan. Conecte Google Sheets en script.js (ENDPOINT).';
      commonBlock.appendChild(note);
    }

    // Fecha límite
    const pastDeadline = Date.now() > new Date(CONFIG.FECHA_LIMITE).getTime();
    if (pastDeadline && CONFIG.CERRAR_AL_VENCER) {
      form.hidden = true;
      closedBox.hidden = false;
      closedBox.innerHTML = `
        <h3 class="done__title">El plazo para confirmar terminó</h3>
        <p class="done__text">Si aún desea acompañarme, escríbame por WhatsApp y con gusto le apunto.</p>
        <a class="btn btn--primary" href="https://wa.me/${CONFIG.WHATSAPP}" target="_blank" rel="noopener">Escribir por WhatsApp</a>`;
      return;
    }

    // Si ya confirmó desde este dispositivo, mostrar el resumen
    const previous = storage.get(CONFIG.STORAGE_KEY);
    if (previous && previous.asiste) showDone(previous, true);

    /* ----- Sí / No ----- */
    $$('input[name="asiste"]', form).forEach((radio) => {
      radio.addEventListener('change', () => {
        clearError($('#asisteError'));
        const yes = radio.value === 'Sí';
        yesBlock.hidden = !yes;
        noBlock.hidden = yes;
        commonBlock.hidden = false;
        if (yes && !list.children.length) addPerson(false);
        updateTally();
      });
    });

    /* ----- Personas ----- */
    function addPerson(focus = true) {
      if (list.children.length >= CONFIG.MAX_PERSONAS) return;
      uid += 1;
      const node = tpl.content.firstElementChild.cloneNode(true);
      const input = $('input[type="text"]', node);
      const label = $('.person__label', node);
      const err = $('.field__error', node);
      const seg = $('.seg', node);
      const id = `persona-${uid}`;

      input.id = id;
      label.htmlFor = id;
      err.id = `${id}-error`;
      input.setAttribute('aria-describedby', err.id);
      $$('input[type="radio"]', seg).forEach((r) => { r.name = `tipo-${uid}`; });

      input.addEventListener('input', () => { clearError(err, input); });
      seg.addEventListener('change', updateTally);
      $('.person__remove', node).addEventListener('click', () => {
        const next = node.nextElementSibling || node.previousElementSibling;
        node.remove();
        renumber();
        updateTally();
        const target = next ? $('input[type="text"]', next) : addBtn;
        if (target) target.focus();
      });

      list.appendChild(node);
      renumber();
      updateTally();
      if (focus) input.focus();
    }

    function renumber() {
      $$('.person', list).forEach((li, i) => {
        const n = i + 1;
        const first = i === 0;
        li.classList.toggle('person--first', first);
        $('.person__num', li).textContent = String(n).padStart(2, '0');
        const input = $('input[type="text"]', li);
        input.placeholder = first ? 'Su nombre completo' : 'Nombre completo';
        input.autocomplete = first ? 'name' : 'off';
        $('.person__label', li).textContent = first ? 'Su nombre completo' : `Nombre del acompañante ${n - 1}`;
        $('.seg', li).setAttribute('aria-label', `Persona ${n}: adulto o niño`);
        const rm = $('.person__remove', li);
        rm.hidden = first;
        rm.setAttribute('aria-label', `Quitar a la persona ${n}`);
      });
      addBtn.hidden = list.children.length >= CONFIG.MAX_PERSONAS;
    }

    function getPeople() {
      return $$('.person', list).map((li) => ({
        nombre: cleanText($('input[type="text"]', li).value),
        tipo: ($('.seg input:checked', li) || {}).value || 'Adulto',
      }));
    }

    function updateTally() {
      if (yesBlock.hidden) { tally.innerHTML = ''; return; }
      const people = getPeople();
      const adults = people.filter((p) => p.tipo === 'Adulto').length;
      const kids = people.length - adults;
      tally.innerHTML = `
        <span class="tally__chip tally__chip--total"><b>${people.length}</b> ${people.length === 1 ? 'persona' : 'personas'}</span>
        <span class="tally__chip"><b>${adults}</b> ${adults === 1 ? 'adulto' : 'adultos'}</span>
        <span class="tally__chip"><b>${kids}</b> ${kids === 1 ? 'niño' : 'niños'}</span>`;
    }

    addBtn.addEventListener('click', () => addPerson(true));

    /* ----- Errores ----- */
    function setError(errEl, msg, input) {
      errEl.textContent = msg;
      errEl.hidden = false;
      if (input) input.setAttribute('aria-invalid', 'true');
    }
    function clearError(errEl, input) {
      if (!errEl) return;
      errEl.textContent = '';
      errEl.hidden = true;
      if (input) input.removeAttribute('aria-invalid');
    }
    phone.addEventListener('input', () => clearError($('#telefonoError'), phone));
    nameNo.addEventListener('input', () => clearError($('#nombreNoError'), nameNo));

    function validate() {
      let firstBad = null;
      const mark = (el) => { if (!firstBad) firstBad = el; };
      const choice = $('input[name="asiste"]:checked', form);

      if (!choice) {
        setError($('#asisteError'), 'Por favor indique si podrá acompañarnos.');
        mark($('input[name="asiste"]', form));
        return firstBad;
      }

      if (choice.value === 'Sí') {
        $$('.person', list).forEach((li, i) => {
          const input = $('input[type="text"]', li);
          const err = $('.field__error', li);
          const v = cleanText(input.value);
          if (v.length < 3) {
            setError(err, i === 0 ? 'Escriba su nombre completo.' : 'Escriba el nombre o quite esta fila.', input);
            mark(input);
          }
        });
        // Teléfono opcional: solo se revisa si escribió algo
        const digits = phone.value.replace(/\D/g, '');
        if (cleanText(phone.value) && (digits.length < 8 || digits.length > 15)) {
          setError($('#telefonoError'), 'Revise el número (8 dígitos, o con código de país) o déjelo vacío.', phone);
          mark(phone);
        }
      } else if (cleanText(nameNo.value).length < 3) {
        setError($('#nombreNoError'), 'Escriba su nombre completo.', nameNo);
        mark(nameNo);
      }
      return firstBad;
    }

    /* ----- Envío ----- */
    function setLoading(on) {
      submitBtn.disabled = on;
      submitBtn.classList.toggle('is-loading', on);
      $('.btn__label', submitBtn).textContent = on ? 'Enviando…' : 'Enviar confirmación';
    }

    async function send(payload) {
      if (!CONFIG.ENDPOINT) {
        await new Promise((r) => setTimeout(r, 900));
        console.info('[Modo de prueba] Datos que se enviarían:', payload);
        return { ok: true, demo: true };
      }
      // Se envía como texto plano para evitar el bloqueo CORS de Apps Script
      const res = await fetch(CONFIG.ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload),
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error al guardar');
      return data;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = '';
      status.classList.remove('is-error');

      const bad = validate();
      if (bad) {
        bad.focus();
        return;
      }

      const yes = $('input[name="asiste"]:checked', form).value === 'Sí';
      const people = yes ? getPeople() : [];
      const payload = {
        asiste: yes ? 'Sí' : 'No',
        contacto: yes ? people[0].nombre : cleanText(nameNo.value),
        telefono: yes ? cleanText(phone.value) : '',
        personas: people,
        mensaje: cleanText(message.value).slice(0, 500),
        web: $('#web').value, // campo trampa
      };

      setLoading(true);
      try {
        const result = await send(payload);
        const record = {
          asiste: payload.asiste,
          contacto: payload.contacto,
          personas: people,
          codigo: result.codigo || '',
          fecha: new Date().toISOString(),
        };
        storage.set(CONFIG.STORAGE_KEY, record);
        showDone(record, false);
      } catch (err) {
        console.error(err);
        status.classList.add('is-error');
        status.innerHTML = `No se pudo enviar su confirmación. Revise su conexión e intente de nuevo, o
          <a href="https://wa.me/${CONFIG.WHATSAPP}" target="_blank" rel="noopener">confirme por WhatsApp</a>.`;
      } finally {
        setLoading(false);
      }
    });

    /* ----- Pantalla de agradecimiento ----- */
    function showDone(record, fromStorage) {
      const first = escapeHTML((record.contacto || '').split(' ')[0]);
      const yes = record.asiste === 'Sí';
      const people = record.personas || [];
      const adults = people.filter((p) => p.tipo === 'Adulto').length;
      const kids = people.length - adults;

      const listHTML = people.map((p) => `
        <li><span>${escapeHTML(p.nombre)}</span>
          <span class="tag ${p.tipo === 'Niño' ? 'tag--nino' : ''}">${p.tipo === 'Niño' ? 'Niño' : 'Adulto'}</span></li>`).join('');

      doneBox.innerHTML = yes ? `
        <div class="done__seal" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
        <h3 class="done__title">${fromStorage ? 'Su asistencia está confirmada' : `¡Gracias, ${first}!`}</h3>
        <p class="done__text">Registré ${plural(people.length, 'persona', 'personas')}
          (${plural(adults, 'adulto', 'adultos')} y ${plural(kids, 'niño', 'niños')}).
          Le espero el <strong>sábado 5 de diciembre a las 6:00 p.&nbsp;m.</strong></p>
        <ul class="done__list">${listHTML}</ul>
        <div class="done__actions">
          <a class="btn btn--primary" href="${$('#gcalLink').href}" target="_blank" rel="noopener">Agregar al calendario</a>
          <button type="button" class="link-btn" data-ics>Usar calendario de iPhone / Outlook</button>
          <button type="button" class="link-btn" data-again>Enviar otra confirmación</button>
        </div>` : `
        <div class="done__seal" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
        <h3 class="done__title">${fromStorage ? 'Recibí su respuesta' : `Gracias por avisarme, ${first}`}</h3>
        <p class="done__text">Lamento que no pueda acompañarme, pero agradezco mucho su cariño a la distancia.</p>
        <div class="done__actions">
          <button type="button" class="link-btn" data-again>Enviar otra confirmación</button>
        </div>`;

      form.hidden = true;
      doneBox.hidden = false;
      $('[data-again]', doneBox).addEventListener('click', resetForm);
      const icsDone = $('[data-ics]', doneBox);
      if (icsDone) icsDone.addEventListener('click', () => $('#icsBtn').click());

      if (!fromStorage) {
        doneBox.focus({ preventScroll: true });
        const top = $('#confirmar').getBoundingClientRect().top + window.scrollY - 20;
        window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }

    function resetForm() {
      storage.remove(CONFIG.STORAGE_KEY);
      form.reset();
      list.innerHTML = '';
      yesBlock.hidden = true;
      noBlock.hidden = true;
      commonBlock.hidden = true;
      tally.innerHTML = '';
      $$('.field__error', form).forEach((el) => clearError(el));
      $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
      doneBox.hidden = true;
      doneBox.innerHTML = '';
      form.hidden = false;
      const firstRadio = $('input[name="asiste"]', form);
      if (firstRadio) firstRadio.focus();
    }
  }

  /* ---------------------------------------------------------
     Inicio
     --------------------------------------------------------- */
  initCalendar();
  initCountdown();
  initRSVP();
  initIntro(initMusic());
})();
