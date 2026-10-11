/**
 * app.js - Главный модуль логики интерфейса учителя.
 */

class TeacherApp {
  constructor() {
    this.catalog = [];
    this.currentGrade = 1; // 1, 2, 3, 4 классы начальной школы
    this.currentBookId = null; // определяется при инициализации из каталога
    this.currentBook = null;
    this.currentPart = 1;
    this.currentPage = 4;
    this.loadToken = 0; // токен загрузки: защита от гонки при быстрой смене учебника
    this.pendingRestore = null; // { bookId, part, page } — состояние для восстановления при старте
    this.answersHidden = false;
    this.selectedEdition = '2023';
    this.fontSizeIndex = 1; // 0: sm, 1: md, 2: lg, 3: xl
    this.fontSizes = ['font-sm', 'font-md', 'font-lg', 'font-xl'];
    this.fontLabels = ['100%', '125%', '155%', '190%'];
    this.fontNames = ['Обычный', 'Крупный', 'Большой', 'Проектор'];
    this.currentTheme = 'light';
    this.isFullScreen = false;
    this.searchIndex = [];
    this.numpadBuffer = '';

    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.initServiceWorker();
    this.loadSavedSettings();

    // Загрузка каталога
    this.catalog = await window.appStorage.getCatalog();
    this.renderGradeNav();

    // Определяем целевой учебник: сохранённая книга текущего класса
    // либо первая книга этого класса в порядке каталога
    const targetBookId = this.resolveInitialBookId();
    this.currentBookId = targetBookId;

    this.renderBooksNav();

    if (targetBookId) {
      // restore = true: подставляем сохранённые часть и страницу
      await this.loadBook(targetBookId, true);
    } else {
      this.showError('Каталог пуст. Проверьте подключение к сети и перезапустите приложение.');
    }
    this.pendingRestore = null;

    // Фоновая загрузка поискового индекса
    window.appStorage.getSearchIndex().then(index => {
      this.searchIndex = index || [];
    });

    this.setupInlineSearch();
  }

  initServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker зарегистрирован:', reg.scope))
        .catch(err => console.warn('Ошибка Service Worker:', err));
    }
  }

  loadSavedSettings() {
    // Тема оформления (Светлая / Тёмная)
    const savedTheme = localStorage.getItem('teacher_theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      this.setTheme('dark');
    } else {
      this.setTheme('light');
    }

    const savedFont = localStorage.getItem('teacher_font_size');
    if (savedFont !== null && !isNaN(parseInt(savedFont, 10))) {
      const idx = parseInt(savedFont, 10);
      if (idx >= 0 && idx < this.fontSizes.length) {
        this.fontSizeIndex = idx;
      }
    }
    this.updateFontSizeUI();

    const savedHide = localStorage.getItem('teacher_hide_answers');
    if (savedHide === 'true') {
      this.toggleAnswers(true);
    }

    // Сохраненный класс (1, 2, 3, 4)
    const savedGrade = localStorage.getItem('teacher_grade');
    if (savedGrade !== null && !isNaN(parseInt(savedGrade, 10))) {
      const g = parseInt(savedGrade, 10);
      if (g >= 1 && g <= 4) {
        this.currentGrade = g;
      }
    }

    // Сохраненная редакция учебника (2020 / 2023)
    const savedEdition = localStorage.getItem('teacher_edition');
    if (savedEdition === '2020' || savedEdition === '2023') {
      this.selectedEdition = savedEdition;
    }

    // Сохраненные учебник, часть и страница. Восстанавливаются при старте,
    // если книга принадлежит сохраненному классу (проверяется в resolveInitialBookId)
    const savedBookId = localStorage.getItem('teacher_book_id');
    if (savedBookId) {
      const savedPart = parseInt(localStorage.getItem('teacher_part'), 10);
      const savedPage = parseInt(localStorage.getItem('teacher_page'), 10);
      this.pendingRestore = {
        bookId: savedBookId,
        part: !isNaN(savedPart) ? savedPart : null,
        page: !isNaN(savedPage) ? savedPage : null
      };
    }
  }

  // Первая книга текущего класса (порядок каталога) либо сохранённая книга,
  // если она относится к этому же классу
  resolveInitialBookId() {
    // Восстановление платного класса без активного доступа (триал истёк,
    // подписка кончилась) — возвращаемся в бесплатный класс вместо показа платного контента
    const canAccess = (book) => {
      const g = parseInt(book && book.grade, 10) || 1;
      if (window.ReshebnikBilling && typeof window.ReshebnikBilling.canAccessGrade === 'function') {
        return window.ReshebnikBilling.canAccessGrade(g);
      }
      return g === 1; // без billing-модуля доступен только 1 класс
    };

    const gradeBooks = this.catalog.filter(b => (b.grade || 1) === this.currentGrade);
    if (gradeBooks.length === 0) return null;

    if (this.pendingRestore && this.pendingRestore.bookId) {
      const savedBook = gradeBooks.find(b => b.id === this.pendingRestore.bookId);
      if (savedBook && canAccess(savedBook)) return savedBook.id;
      if (savedBook && !canAccess(savedBook)) {
        // Платный контент недоступен — открываем первый бесплатный класс
        this.currentGrade = 1;
        localStorage.setItem('teacher_grade', 1);
        this.pendingRestore = null;
        // Синхронизируем подсветку вкладок классов с фактическим классом
        document.querySelectorAll('.grade-tab').forEach(function (t) {
          t.classList.toggle('active', parseInt(t.getAttribute('data-grade'), 10) === 1);
        });
        const freeBooks = this.catalog.filter(b => (b.grade || 1) === 1);
        if (freeBooks.length) return freeBooks[0].id;
      }
    }
    if (!canAccess(gradeBooks[0])) {
      this.currentGrade = 1;
      localStorage.setItem('teacher_grade', 1);
        // Синхронизируем подсветку вкладок классов с фактическим классом
        document.querySelectorAll('.grade-tab').forEach(function (t) {
          t.classList.toggle('active', parseInt(t.getAttribute('data-grade'), 10) === 1);
        });
      const freeBooks = this.catalog.filter(b => (b.grade || 1) === 1);
      if (freeBooks.length) return freeBooks[0].id;
    }
    return gradeBooks[0].id;
  }

  renderGradeNav() {
    const tabs = document.querySelectorAll('.grade-tab');
    tabs.forEach(btn => {
      const g = parseInt(btn.getAttribute('data-grade'), 10);
      btn.classList.toggle('active', g === this.currentGrade);
      btn.addEventListener('click', () => {
        this.selectGrade(g);
      });
    });
  }

  async selectGrade(gradeNum) {
    if (this.currentGrade === gradeNum) return;
    this.currentGrade = gradeNum;
    localStorage.setItem('teacher_grade', this.currentGrade);

    // Обновляем визуальный активный класс
    document.querySelectorAll('.grade-tab').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.getAttribute('data-grade'), 10) === this.currentGrade);
      if (btn.classList.contains('active')) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });

    this.renderBooksNav();

    // Выбираем первый учебник выбранного класса (в порядке каталога),
    // начиная с его первой части
    const gradeBooks = this.catalog.filter(b => (b.grade || 1) === this.currentGrade);
    if (gradeBooks.length > 0) {
      this.currentPart = 1;
      await this.selectBook(gradeBooks[0].id);
    }
  }

  renderBooksNav() {
    const navEl = document.getElementById('booksNav');
    if (!navEl) return;

    const books = this.catalog.filter(b => (b.grade || 1) === this.currentGrade);

    if (books.length === 0) {
      navEl.innerHTML = `<div style="padding: 8px 12px; color: var(--text-muted); font-size: 0.9rem;">Материалы для ${this.currentGrade} класса загружаются...</div>`;
      return;
    }

    navEl.innerHTML = books.map(b => `
      <button class="book-tab ${b.id === this.currentBookId ? 'active' : ''}" data-id="${b.id}">
        <span>${this.escapeHtml(b.title)}</span>
      </button>
    `).join('');

    // Активная вкладка должна быть видна при горизонтальной прокрутке
    const activeBookTab = navEl.querySelector('.book-tab.active');
    if (activeBookTab) activeBookTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    navEl.querySelectorAll('.book-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        this.selectBook(id);
      });
    });
  }

  async selectBook(bookId) {
    if (this.currentBookId === bookId && this.currentBook) return;
    this.currentBookId = bookId;

    // Обновляем активную вкладку
    document.querySelectorAll('.book-tab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-id') === bookId);
    });

    await this.loadBook(bookId);
  }

  async loadBook(bookId, restore = false) {
    // Токен загрузки: если пока шел запрос, выбрали другой учебник —
    // ответ устаревшего запроса игнорируется
    const token = ++this.loadToken;
    this.showLoading();
    const book = await window.appStorage.getBook(bookId);
    if (token !== this.loadToken) return;

    if (!book) {
      this.showError(`Не удалось загрузить данные учебника`);
      return;
    }

    this.currentBook = book;
    this.currentBookId = book.id || bookId;
    localStorage.setItem('teacher_book_id', this.currentBookId);

    // Рендерим селектор частей
    this.renderPartsSelector();

    // Выбираем доступную часть (при восстановлении — сохраненную)
    const parts = Object.keys(this.currentBook.parts).map(Number);
    let targetPart = parts.includes(this.currentPart) ? this.currentPart : parts[0];
    const savedPart = restore && this.pendingRestore ? this.pendingRestore.part : null;
    if (savedPart !== null && parts.includes(savedPart)) {
      targetPart = savedPart;
    }
    this.currentPart = targetPart;
    localStorage.setItem('teacher_part', String(this.currentPart));
    this.updatePartsUI();

    // Выбираем начальную страницу (при восстановлении — сохраненную)
    const pageList = this.getCurrentPartPageList();
    const savedPage = restore && this.pendingRestore ? this.pendingRestore.page : null;
    if (pageList.length > 0) {
      if (savedPage !== null && pageList.includes(savedPage)) {
        this.goToPage(savedPage);
      } else {
        this.goToPage(pageList[0]);
      }
    } else {
      this.showEmptyState();
    }
  }

  renderPartsSelector() {
    const selectorEl = document.getElementById('partsSelector');
    if (!selectorEl || !this.currentBook) return;

    const parts = Object.keys(this.currentBook.parts).map(Number).sort((a, b) => a - b);
    if (parts.length <= 1) {
      selectorEl.style.display = 'none';
      return;
    }

    selectorEl.style.display = 'flex';
    selectorEl.innerHTML = parts.map(p => `
      <button class="part-btn ${p === this.currentPart ? 'active' : ''}" data-part="${p}">
        Часть ${p}
      </button>
    `).join('');

    selectorEl.querySelectorAll('.part-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const part = parseInt(btn.getAttribute('data-part'), 10);
        this.selectPart(part);
      });
    });
  }

  updatePartsUI() {
    document.querySelectorAll('.part-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.getAttribute('data-part'), 10) === this.currentPart);
    });
  }

  selectPart(partNum) {
    this.currentPart = partNum;
    localStorage.setItem('teacher_part', String(this.currentPart));
    this.updatePartsUI();
    const pageList = this.getCurrentPartPageList();
    if (pageList.length > 0) {
      this.goToPage(pageList[0]);
    }
  }

  getCurrentPartPageList() {
    if (!this.currentBook || !this.currentBook.parts[this.currentPart]) return [];
    return Object.keys(this.currentBook.parts[this.currentPart].pages)
      .map(Number)
      .sort((a, b) => a - b);
  }

  goToPage(pageNum) {
    if (!this.currentBook) return;
    const partData = this.currentBook.parts[this.currentPart];
    if (!partData) return;

    const page = partData.pages[pageNum];
    if (!page) {
      console.warn(`Страница ${pageNum} не найдена в части ${this.currentPart}`);
      return;
    }

    this.currentPage = pageNum;
    localStorage.setItem('teacher_page', String(this.currentPage));
    this.renderCurrentPage(page);
    this.updateNavButtons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  renderCurrentPage(page) {
    const metaTitleEl = document.getElementById('pageMetaTitle');
    const pageHeadingEl = document.getElementById('pageHeading');
    const topicsEl = document.getElementById('pageTopics');
    const editionBoxEl = document.getElementById('editionSwitchBox');
    const contentEl = document.getElementById('pageContent');
    const pageInput = document.getElementById('pageInput');
    const pageTotalEl = document.getElementById('pageTotalLabel');

    const pageList = this.getCurrentPartPageList();
    const maxPage = pageList[pageList.length - 1] || 0;

    if (pageInput) {
      pageInput.value = this.currentPage;
      if (maxPage > 0) pageInput.max = maxPage;
    }
    if (pageTotalEl) pageTotalEl.textContent = `/ ${maxPage}`;

    if (metaTitleEl) {
      metaTitleEl.textContent = `${this.currentBook.title} ${this.currentBook.grade || 1} класс • Часть ${this.currentPart}`;
    }

    if (pageHeadingEl) {
      pageHeadingEl.textContent = `Страница ${page.pageNumber}`;
    }

    if (topicsEl) {
      // Дедупликация тем (в данных бывают повторы одной темы)
      const topics = page.topics
        ? [...new Set(page.topics.map(t => String(t).trim()).filter(Boolean))]
        : [];
      if (topics.length > 0) {
        topicsEl.innerHTML = topics.map(t => `<span class="page-topic-tag">${this.escapeHtml(t)}</span>`).join(' ');
        topicsEl.style.display = 'block';
      } else {
        topicsEl.style.display = 'none';
      }
    }

    // Всегда отрисовываем полный контент страницы из contentHtml (относительные пути для GitHub Pages / любого хостинга)
    contentEl.innerHTML = (page.contentHtml || '').replace(/src=["']\/images\//g, 'src="./images/');

    // Гарантированное удаление любых видео/Rutube/iframes и мусорных элементов
    contentEl.querySelectorAll('iframe, video, .rutube-wrapper, .rutube-player, .img-wrap').forEach(el => el.remove());

    // Инициализируем переключатели вариантов года издания (worko-tabs)
    const hasWorkoTabs = this.initWorkoTabs(contentEl);

    // Обработка верхнего переключателя годов (2020 / 2023)
    if (editionBoxEl) {
      if (hasWorkoTabs || page.hasEditions) {
        editionBoxEl.style.display = 'flex';
        this.applyEdition(this.selectedEdition, contentEl);
      } else {
        editionBoxEl.style.display = 'none';
      }
    }

    // Инициализируем другие вкладки и аккордеоны
    this.initTabs(contentEl);
    this.initAccordions(contentEl);

    // Навешиваем зум и обработку ошибок на картинки
    contentEl.querySelectorAll('img').forEach(img => {
      img.addEventListener('error', () => {
        img.style.display = 'none';
        const wrapper = img.closest('.img-wrapper-460, .img-wrapper-450, .img-wrap');
        if (wrapper) wrapper.style.display = 'none';
      });
      img.addEventListener('click', () => {
        this.openLightbox(img.src);
      });
    });

    // Инициализируем ответы на странице
    this.initAnswersOnPage(contentEl);
  }

  // ================= ВКЛАДКИ ВАРИАНТОВ ИЗДАНИЯ (WORKO-TABS) =================
  initWorkoTabs(contentContainer) {
    if (!contentContainer) return false;
    // Полностью удаляем остатки контейнеров переключателей редакций и любые локальные вкладки
    const workoContainers = contentContainer.querySelectorAll('[class*="worko-tabs"], .edition-local-tabs, .tabs.flex-tabs');
    workoContainers.forEach(container => container.remove());

    // Проверяем наличие панелей разных годов на странице (2020 vs 2023)
    const hasPanels = contentContainer.querySelector('[id*="tab-one"], [id*="tab-two"]');
    return !!hasPanels;
  }

  applyEdition(year, contentContainer = document.getElementById('pageContent')) {
    if (!contentContainer) return;

    // Обновляем верхние кнопки переключения в заголовке
    document.querySelectorAll('.edition-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-year') === year);
    });

    // Переключаем панели года издания для заданий
    const panelsOne = contentContainer.querySelectorAll('[id*="tab-one"]');
    const panelsTwo = contentContainer.querySelectorAll('[id*="tab-two"]');

    if (year === '2023') {
      panelsOne.forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
      panelsTwo.forEach(p => { p.style.display = 'block'; p.classList.add('active'); });
    } else {
      panelsOne.forEach(p => { p.style.display = 'block'; p.classList.add('active'); });
      panelsTwo.forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
    }
  }

  setEdition(year) {
    this.selectedEdition = year;
    localStorage.setItem('teacher_edition', year);
    const contentEl = document.getElementById('pageContent');
    this.applyEdition(year, contentEl);
  }

  // ================= АККОРДЕОНЫ ПОДСКАЗОК И ПОШАГОВЫХ РАЗБОРОВ =================
  initAccordions(contentContainer) {
    if (!contentContainer) return;
    const accordions = contentContainer.querySelectorAll('.accordion-help');
    accordions.forEach((acc, idx) => {
      const checkbox = acc.querySelector('.acc-toggle');
      const btn = acc.querySelector('.acc-btn');
      if (checkbox && btn) {
        const uniqueId = `acc_toggle_${Date.now()}_${idx}_${Math.floor(Math.random() * 100000)}`;
        checkbox.id = uniqueId;
        btn.setAttribute('for', uniqueId);
      }
    });
  }

  // ================= ПЕРЕКЛЮЧЕНИЕ СПОСОБОВ РЕШЕНИЯ (№1, №2...) =================
  initTabs(contentContainer) {
    if (!contentContainer) return;
    const tabContainers = contentContainer.querySelectorAll('tab-container');
    if (!tabContainers || tabContainers.length === 0) return;

    tabContainers.forEach((container, groupIdx) => {
      const radios = Array.from(container.querySelectorAll('input[type="radio"]'));
      const labels = Array.from(container.querySelectorAll('label'));
      const contents = Array.from(container.querySelectorAll('tab-content'));

      if (contents.length === 0) return;

      const groupName = `tabgroup_${Date.now()}_${groupIdx}_${Math.floor(Math.random() * 10000)}`;

      // Определяем начальную активную вкладку (по checked или первую)
      let activeIndex = 0;
      radios.forEach((radio, idx) => {
        if (radio.checked) activeIndex = idx;
      });

      const updateTabState = (newIndex) => {
        activeIndex = newIndex;
        radios.forEach((r, idx) => {
          r.checked = (idx === newIndex);
        });
        labels.forEach((l, idx) => {
          l.classList.toggle('active', idx === newIndex);
        });
        contents.forEach((c, idx) => {
          if (idx === newIndex) {
            c.style.display = 'block';
            c.classList.add('active');
          } else {
            c.style.display = 'none';
            c.classList.remove('active');
          }
        });
      };

      radios.forEach((radio, idx) => {
        radio.name = groupName;
        const uniqueId = `${groupName}_r${idx}`;
        radio.id = uniqueId;
        if (labels[idx]) {
          labels[idx].htmlFor = uniqueId;
        }

        radio.addEventListener('change', () => {
          if (radio.checked) {
            updateTabState(idx);
          }
        });
      });

      labels.forEach((label, idx) => {
        label.addEventListener('click', (e) => {
          e.preventDefault();
          updateTabState(idx);
        });
      });

      // Применяем начальное состояние
      updateTabState(activeIndex);
    });
  }



  updateNavButtons() {
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const pageList = this.getCurrentPartPageList();
    const currentIdx = pageList.indexOf(this.currentPage);

    if (prevBtn) prevBtn.disabled = currentIdx <= 0;
    if (nextBtn) nextBtn.disabled = currentIdx === -1 || currentIdx >= pageList.length - 1;
  }

  prevPage() {
    const pageList = this.getCurrentPartPageList();
    const currentIdx = pageList.indexOf(this.currentPage);
    if (currentIdx > 0) {
      this.goToPage(pageList[currentIdx - 1]);
    }
  }

  nextPage() {
    const pageList = this.getCurrentPartPageList();
    const currentIdx = pageList.indexOf(this.currentPage);
    if (currentIdx !== -1 && currentIdx < pageList.length - 1) {
      this.goToPage(pageList[currentIdx + 1]);
    }
  }

  // Инициализация ответов на странице
  initAnswersOnPage(contentEl) {
    if (!contentEl) return;
    const sdvigs = contentEl.querySelectorAll('.sdvig');
    if (!sdvigs || sdvigs.length === 0) {
      this.updateToggleAnswersBtnUI();
      return;
    }

    sdvigs.forEach(sdvig => {
      // Убеждаемся, что кнопка "Скрыть ответ" присутствует внутри sdvig
      if (!sdvig.querySelector('.answer-toggle-btn')) {
        const btn = document.createElement('button');
        btn.className = 'answer-toggle-btn';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Скрыть ответ');
        btn.innerHTML = '<svg class="icon" style="width:13px;height:13px;margin-right:4px;" aria-hidden="true"><use href="#i-eye-off"></use></svg>Скрыть ответ';
        sdvig.prepend(btn);
      }

      const prevOtvet = sdvig.previousElementSibling;
      const isOtvet = prevOtvet && prevOtvet.classList.contains('otvet');

      if (this.answersHidden) {
        sdvig.classList.add('answer-hidden');
        sdvig.classList.remove('answer-revealed');
        if (isOtvet) {
          prevOtvet.classList.add('answer-hidden');
          prevOtvet.classList.remove('answer-revealed');
        }
      } else {
        sdvig.classList.add('answer-revealed');
        sdvig.classList.remove('answer-hidden');
        if (isOtvet) {
          prevOtvet.classList.add('answer-revealed');
          prevOtvet.classList.remove('answer-hidden');
        }
      }
    });

    this.updateToggleAnswersBtnUI();
  }

  toggleSingleAnswer(sdvig, forceReveal) {
    if (!sdvig) return;
    const isCurrentlyHidden = sdvig.classList.contains('answer-hidden');
    const shouldReveal = typeof forceReveal === 'boolean' ? forceReveal : isCurrentlyHidden;

    const prevOtvet = sdvig.previousElementSibling;
    const isOtvet = prevOtvet && prevOtvet.classList.contains('otvet');

    if (shouldReveal) {
      sdvig.classList.remove('answer-hidden');
      sdvig.classList.add('answer-revealed');
      if (isOtvet) {
        prevOtvet.classList.remove('answer-hidden');
        prevOtvet.classList.add('answer-revealed');
      }
    } else {
      sdvig.classList.add('answer-hidden');
      sdvig.classList.remove('answer-revealed');
      if (isOtvet) {
        prevOtvet.classList.add('answer-hidden');
        prevOtvet.classList.remove('answer-revealed');
      }
    }

    this.updateToggleAnswersBtnUI();
  }

  updateToggleAnswersBtnUI() {
    const btn = document.getElementById('toggleAnswersBtn');
    if (!btn) return;

    const sdvigs = document.querySelectorAll('.exercise-content .sdvig');
    const hiddenCount = document.querySelectorAll('.exercise-content .sdvig.answer-hidden').length;

    // Если хотя бы один ответ скрыт — кнопка предлагает "Показать ответы"
    // Если все ответы открыты (или ответов нет и answersHidden false) — кнопка предлагает "Скрыть ответы"
    const hasHidden = hiddenCount > 0 || (sdvigs.length === 0 && this.answersHidden);

    if (hasHidden) {
      btn.innerHTML = '<span class="tool-btn-icon"><svg class="icon" aria-hidden="true"><use href="#i-eye"></use></svg></span> <span class="tool-btn-text"><span class="tool-label-action">Показать</span><span class="tool-label-extra"> ответы</span></span>';
      btn.classList.remove('active');
    } else {
      btn.innerHTML = '<span class="tool-btn-icon"><svg class="icon" aria-hidden="true"><use href="#i-eye-off"></use></svg></span> <span class="tool-btn-text"><span class="tool-label-action">Скрыть</span><span class="tool-label-extra"> ответы</span></span>';
      btn.classList.add('active');
    }

    document.body.classList.toggle('hide-answers', hasHidden);
  }

  toggleAnswers(forceState) {
    const sdvigs = document.querySelectorAll('.exercise-content .sdvig');
    const hiddenCount = document.querySelectorAll('.exercise-content .sdvig.answer-hidden').length;

    let shouldShowAll;
    if (typeof forceState === 'boolean') {
      shouldShowAll = !forceState;
    } else {
      // Если хотя бы один скрыт — открываем ВСЕ закрытые, а уже открытые остаются открытыми!
      // Если все открыты — закрываем ВСЕ!
      shouldShowAll = hiddenCount > 0 || (sdvigs.length === 0 && this.answersHidden);
    }

    if (shouldShowAll) {
      // Открываем все скрытые ответы (уже открытые остаются открытыми)
      sdvigs.forEach(sdvig => {
        sdvig.classList.remove('answer-hidden');
        sdvig.classList.add('answer-revealed');
        const prevOtvet = sdvig.previousElementSibling;
        if (prevOtvet && prevOtvet.classList.contains('otvet')) {
          prevOtvet.classList.remove('answer-hidden');
          prevOtvet.classList.add('answer-revealed');
        }
      });
      this.answersHidden = false;
    } else {
      // Закрываем все ответы
      sdvigs.forEach(sdvig => {
        sdvig.classList.add('answer-hidden');
        sdvig.classList.remove('answer-revealed');
        const prevOtvet = sdvig.previousElementSibling;
        if (prevOtvet && prevOtvet.classList.contains('otvet')) {
          prevOtvet.classList.add('answer-hidden');
          prevOtvet.classList.remove('answer-revealed');
        }
      });
      this.answersHidden = true;
    }

    localStorage.setItem('teacher_hide_answers', this.answersHidden);
    this.updateToggleAnswersBtnUI();
  }

  updateFontSizeUI() {
    // Безопасно снимаем все классы шрифтов и вешаем активный
    document.body.classList.remove(...this.fontSizes);
    const activeClass = this.fontSizes[this.fontSizeIndex] || 'font-md';
    document.body.classList.add(activeClass);

    // Обновляем кнопку в шапке и показываем текущий процент масштаба
    const btn = document.getElementById('fontSizeBtn');
    if (btn) {
      const label = this.fontLabels[this.fontSizeIndex] || '125%';
      const name = this.fontNames[this.fontSizeIndex] || 'Крупный';
      btn.innerHTML = `<span class="tool-btn-icon"><svg class="icon" aria-hidden="true"><use href="#i-type"></use></svg></span> <span class="tool-btn-text"><span class="tool-label-extra">Шрифт </span><span class="font-badge">${label}</span></span>`;
      btn.title = `Размер текста: ${name} (${label}). Нажмите для переключения (100% → 125% → 155% → 190%).`;
    }

    localStorage.setItem('teacher_font_size', this.fontSizeIndex);
  }

  cycleFontSize() {
    this.fontSizeIndex = (this.fontSizeIndex + 1) % this.fontSizes.length;
    this.updateFontSizeUI();
  }

  // ================= ТЕМА ОФОРМЛЕНИЯ (СВЕТЛАЯ / ТЁМНАЯ) =================
  setTheme(theme) {
    this.currentTheme = theme;
    const isDark = theme === 'dark';
    document.body.classList.toggle('theme-dark', isDark);

    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
      btn.innerHTML = isDark
        ? '<svg class="icon" aria-hidden="true"><use href="#i-sun"></use></svg> <span class="theme-label tool-btn-text">Светлая</span>'
        : '<svg class="icon" aria-hidden="true"><use href="#i-moon"></use></svg> <span class="theme-label tool-btn-text">Тёмная</span>';
      btn.title = isDark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему для вечерней работы';
    }

    // Обновляем цвет статус-бара iOS / браузера
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#14171D' : '#F5F0E6');
    }

    localStorage.setItem('teacher_theme', theme);
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
  }

  // ================= ПОЛНОЭКРАННЫЙ РЕЖИМ (ДЛЯ ПРОЕКТОРА) =================
  toggleFullScreen() {
    if (window.electronAPI && window.electronAPI.toggleFullScreen) {
      window.electronAPI.toggleFullScreen();
      return;
    }

    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  exitFullScreen() {
    if (window.electronAPI && window.electronAPI.exitFullScreen) {
      window.electronAPI.exitFullScreen();
      return;
    }

    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  setFullScreenState(isFull) {
    this.isFullScreen = isFull;
    document.body.classList.toggle('fullscreen-mode', isFull);

    const btn = document.getElementById('fullscreenBtn');
    if (btn) {
      if (isFull) {
        btn.innerHTML = '<span class="fs-icon tool-btn-icon"><svg class="icon" aria-hidden="true"><use href="#i-minimize"></use></svg></span> <span class="fs-label tool-btn-text">Свернуть</span>';
        btn.classList.add('active-fullscreen');
        btn.title = 'Свернуть полноэкранный режим (Esc / F11)';
      } else {
        btn.innerHTML = '<span class="fs-icon tool-btn-icon"><svg class="icon" aria-hidden="true"><use href="#i-maximize"></use></svg></span> <span class="fs-label tool-btn-text">Экран</span>';
        btn.classList.remove('active-fullscreen');
        btn.title = 'Полноэкранный режим для проектора (F11)';
      }
    }
  }

  // ================= NUMPAD ДЛЯ БЫСТРОГО НАБОРА НА IPAD =================
  openNumpad() {
    this.numpadBuffer = '';
    this.updateNumpadDisplay();
    const modal = document.getElementById('numpadModal');
    if (modal) modal.classList.add('open');
  }

  closeNumpad() {
    const modal = document.getElementById('numpadModal');
    if (modal) modal.classList.remove('open');
  }

  numpadPress(digit) {
    if (this.numpadBuffer.length < 3) {
      this.numpadBuffer += digit;
      this.updateNumpadDisplay();
    }
  }

  numpadClear() {
    this.numpadBuffer = '';
    this.updateNumpadDisplay();
  }

  numpadBackspace() {
    this.numpadBuffer = this.numpadBuffer.slice(0, -1);
    this.updateNumpadDisplay();
  }

  numpadSubmit() {
    const num = parseInt(this.numpadBuffer, 10);
    this.closeNumpad();
    if (!isNaN(num)) {
      this.jumpToPage(num);
    }
  }

  updateNumpadDisplay() {
    const disp = document.getElementById('numpadDisplay');
    if (disp) disp.textContent = this.numpadBuffer || '—';
  }

  jumpToPage(pageNum) {
    const pageList = this.getCurrentPartPageList();
    if (pageList.includes(pageNum)) {
      this.goToPage(pageNum);
      return;
    }

    // Если страница в другой части этого же учебника
    for (const pNum of Object.keys(this.currentBook.parts).map(Number)) {
      if (this.currentBook.parts[pNum].pages[pageNum]) {
        this.currentPart = pNum;
        localStorage.setItem('teacher_part', String(this.currentPart));
        this.updatePartsUI();
        this.goToPage(pageNum);
        return;
      }
    }

    this.showToast(`Страница ${pageNum} не найдена в текущем учебнике`);
  }

  // Реальный диапазон номеров страниц по всем частям текущего учебника
  getBookPageRange() {
    if (!this.currentBook) return null;
    let min = Infinity;
    let max = 0;
    for (const pNum of Object.keys(this.currentBook.parts).map(Number)) {
      const pages = Object.keys(this.currentBook.parts[pNum].pages).map(Number);
      for (const p of pages) {
        if (p < min) min = p;
        if (p > max) max = p;
      }
    }
    if (!isFinite(min) || max === 0) return null;
    return { min, max };
  }

  // ================= APP TOAST (ненавязчивое уведомление вместо alert) =================
  showToast(message) {
    const existing = document.getElementById('appToast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'app-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 3200);
  }

  // ================= ПРЯМОЙ ПОИСК ПО ТЕМАМ И СТРАНИЦАМ =================
  setupInlineSearch() {
    const input = document.getElementById('inlineSearchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    const resultsContainer = document.getElementById('inlineSearchResults');
    if (!input || !resultsContainer) return;

    let selectedIndex = -1;

    const doSearch = () => {
      const q = input.value.trim();
      if (!q) {
        if (clearBtn) clearBtn.style.display = 'none';
        this.closeInlineSearchResults();
        return;
      }

      if (clearBtn) clearBtn.style.display = 'flex';
      selectedIndex = -1;
      this.handleInlineSearch(q);
    };

    input.addEventListener('input', () => {
      doSearch();
    });

    input.addEventListener('focus', () => {
      if (input.value.trim()) {
        doSearch();
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        input.value = '';
        clearBtn.style.display = 'none';
        this.closeInlineSearchResults();
        input.focus();
      });
    }

    input.addEventListener('keydown', (e) => {
      const items = resultsContainer.querySelectorAll('.dropdown-search-item');
      if (resultsContainer.style.display !== 'none' && items.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIndex = (selectedIndex + 1) % items.length;
          this.updateDropdownActiveItem(items, selectedIndex);
          return;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIndex = (selectedIndex - 1 + items.length) % items.length;
          this.updateDropdownActiveItem(items, selectedIndex);
          return;
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (selectedIndex >= 0 && items[selectedIndex]) {
            items[selectedIndex].click();
          } else if (items.length > 0) {
            items[0].click();
          }
          return;
        }
      }

      if (e.key === 'Enter') {
        const q = input.value.trim();
        const matchPage = q.match(/^(?:стр\.?\s*)?(\d+)$/i);
        if (matchPage) {
          e.preventDefault();
          const pageNum = parseInt(matchPage[1], 10);
          this.closeInlineSearchResults();
          this.jumpToPage(pageNum);
        }
      } else if (e.key === 'Escape') {
        this.closeInlineSearchResults();
        input.blur();
      }
    });

    // Закрытие выпадающего списка при клике вне зоны поиска
    document.addEventListener('click', (e) => {
      const searchBox = document.querySelector('.search-box-inline');
      if (searchBox && !searchBox.contains(e.target)) {
        this.closeInlineSearchResults();
      }
    });
  }

  updateDropdownActiveItem(items, index) {
    items.forEach((item, idx) => {
      if (idx === index) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  closeInlineSearchResults() {
    const resultsContainer = document.getElementById('inlineSearchResults');
    if (resultsContainer) {
      resultsContainer.style.display = 'none';
      resultsContainer.innerHTML = '';
    }
  }

  async handleInlineSearch(query) {
    const q = query.trim();
    if (!q) {
      this.closeInlineSearchResults();
      return;
    }

    if (!this.searchIndex || this.searchIndex.length === 0) {
      this.searchIndex = await window.appStorage.getSearchIndex() || [];
    }

    const qLower = q.toLowerCase();
    const matchPage = q.match(/^(?:стр\.?\s*)?(\d+)$/i);
    const qPageNum = matchPage ? parseInt(matchPage[1], 10) : null;

    let scoredResults = [];

    // Если введено число (например: 15 или стр 15)
    if (qPageNum !== null) {
      // Предлагаем прямой переход в текущем учебнике
      if (this.currentBook) {
        scoredResults.push({
          bookId: this.currentBookId,
          bookTitle: this.currentBook.title,
          part: this.currentPart,
          page: qPageNum,
          topics: ['Быстрый переход на страницу'],
          snippet: `Открыть страницу ${qPageNum} в ${this.currentBook.title} (Часть ${this.currentPart})`,
          score: 1000
        });
      }

      // Добавляем страницы с таким номером из индекса всех учебников
      for (const item of this.searchIndex) {
        if (item.page === qPageNum) {
          const isCurrentBook = item.bookId === this.currentBookId;
          const isCurrentPart = isCurrentBook && item.part === this.currentPart;
          scoredResults.push({
            ...item,
            score: isCurrentPart ? 500 : (isCurrentBook ? 400 : 200)
          });
        }
      }
    }

    // Текстовый поиск по темам и сниппетам
    for (const item of this.searchIndex) {
      // Исключаем дубликаты, если уже добавлены по номеру страницы
      if (qPageNum !== null && item.page === qPageNum) continue;

      let score = 0;
      const topicMatch = item.topics && item.topics.some(t => t.toLowerCase().includes(qLower));
      const snippetMatch = item.snippet && item.snippet.toLowerCase().includes(qLower);

      if (topicMatch) score += 100;
      if (snippetMatch) score += 30;

      if (score > 0) {
        if (item.bookId === this.currentBookId) score += 25;
        if (item.bookId === this.currentBookId && item.part === this.currentPart) score += 10;
        scoredResults.push({ ...item, score });
      }
    }

    scoredResults.sort((a, b) => b.score - a.score);
    const topResults = scoredResults.slice(0, 20);

    this.renderInlineSearchResults(topResults, q);
  }

  renderInlineSearchResults(results, query) {
    const container = document.getElementById('inlineSearchResults');
    if (!container) return;

    if (results.length === 0) {
      container.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
          Ничего не найдено по запросу "<b>${this.escapeHtml(query)}</b>"
        </div>
      `;
      container.style.display = 'block';
      return;
    }

    container.innerHTML = results.map(item => `
      <div class="dropdown-search-item" data-book="${this.escapeHtml(item.bookId)}" data-part="${item.part}" data-page="${item.page}">
        <div class="dropdown-item-header">
          <span class="dropdown-item-book">${this.escapeHtml(item.bookTitle)} (ч. ${item.part})</span>
          <span class="dropdown-item-page">Стр. ${item.page}</span>
        </div>
        ${item.topics && item.topics.length ? `<div class="dropdown-item-topic">${this.escapeHtml(item.topics.join(', '))}</div>` : ''}
        ${item.snippet ? `<div class="dropdown-item-snippet">${this.escapeHtml(item.snippet)}</div>` : ''}
      </div>
    `).join('');

    container.querySelectorAll('.dropdown-search-item').forEach(el => {
      el.addEventListener('click', async () => {
        const bId = el.getAttribute('data-book');
        const part = parseInt(el.getAttribute('data-part'), 10);
        const page = parseInt(el.getAttribute('data-page'), 10);

        this.closeInlineSearchResults();

        if (this.currentBookId !== bId) {
          await this.selectBook(bId);
        }
        if (this.currentPart !== part) {
          this.selectPart(part);
        }
        this.goToPage(page);
      });
    });

    container.style.display = 'block';
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ================= LIGHTBOX ДЛЯ КАРТИНОК =================
  openLightbox(src) {
    const modal = document.getElementById('lightboxModal');
    const img = document.getElementById('lightboxImg');
    if (modal && img) {
      img.src = src;
      modal.classList.add('open');
    }
  }

  closeLightbox() {
    const modal = document.getElementById('lightboxModal');
    if (modal) modal.classList.remove('open');
  }

  showLoading() {
    const content = document.getElementById('pageContent');
    if (content) content.innerHTML = '<div style="text-align:center; padding: 40px;">Загрузка задания...</div>';
  }

  showError(msg) {
    const content = document.getElementById('pageContent');
    if (content) content.innerHTML = `<div style="text-align:center; padding: 40px; color: #D6563E;">${msg}</div>`;
  }

  showEmptyState() {
    const content = document.getElementById('pageContent');
    if (content) content.innerHTML = '<div style="text-align:center; padding: 40px;">В этой части нет доступных страниц</div>';
  }

  setupEventListeners() {
    // Переход назад/вперед
    document.getElementById('prevPageBtn')?.addEventListener('click', () => this.prevPage());
    document.getElementById('nextPageBtn')?.addEventListener('click', () => this.nextPage());
    // Степпер у номера страницы: вверх — следующая, вниз — предыдущая
    document.getElementById('pageStepUp')?.addEventListener('click', () => this.nextPage());
    document.getElementById('pageStepDown')?.addEventListener('click', () => this.prevPage());

    // Прямой ввод номера страницы в шапке
    const pageInput = document.getElementById('pageInput');
    if (pageInput) {
      // Подтверждение ввода: Enter / клавиша Go на мобильной клавиатуре / потеря фокуса.
      // Диапазон валидации берется из реального числа страниц текущего учебника
      const submitPageInput = () => {
        const val = parseInt(pageInput.value, 10);
        if (isNaN(val)) {
          // Невалидный ввод — тихо возвращаем актуальную страницу
          pageInput.value = this.currentPage;
          return;
        }
        const range = this.getBookPageRange();
        if (range && (val < range.min || val > range.max)) {
          pageInput.value = this.currentPage;
          return;
        }
        this.jumpToPage(val);
      };

      pageInput.addEventListener('change', submitPageInput);
      pageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitPageInput();
          pageInput.blur();
        }
      });

      // При ширине <= 1024 ввод делаем readonly: клик открывает крупный numpad,
      // а системная клавиатура не выезжает
      const updatePageInputReadonly = () => {
        const useNumpad = window.innerWidth <= 1024;
        pageInput.readOnly = useNumpad;
        pageInput.setAttribute('inputmode', useNumpad ? 'none' : 'numeric');
      };
      updatePageInputReadonly();
      window.addEventListener('resize', updatePageInputReadonly);

      pageInput.addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
          this.openNumpad();
        }
      });
    }

    // Открытие numpad по кнопке
    document.getElementById('openNumpadBtn')?.addEventListener('click', () => this.openNumpad());

    // Numpad клавиши
    document.querySelectorAll('.num-key').forEach(key => {
      key.addEventListener('click', () => {
        const digit = key.getAttribute('data-digit');
        const action = key.getAttribute('data-action');
        if (digit !== null) this.numpadPress(digit);
        if (action === 'clear') this.numpadClear();
        if (action === 'backspace') this.numpadBackspace();
        if (action === 'enter') this.numpadSubmit();
      });
    });

    document.getElementById('numpadCloseBtn')?.addEventListener('click', () => this.closeNumpad());
    document.getElementById('numpadModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'numpadModal') this.closeNumpad();
    });

    // Учительские кнопки: Скрытие ответов, шрифт, тема, полный экран
    document.getElementById('toggleAnswersBtn')?.addEventListener('click', () => this.toggleAnswers());

    // Интерактивное открытие/скрытие отдельных ответов по клику в режиме скрытия ответов
    const pageContentEl = document.getElementById('pageContent');
    if (pageContentEl) {
      pageContentEl.addEventListener('click', (e) => {
        // 1. Клик по кнопке "Скрыть ответ" внутри раскрытого ответа
        const toggleBtn = e.target.closest('.answer-toggle-btn');
        if (toggleBtn) {
          e.preventDefault();
          e.stopPropagation();
          const sdvig = toggleBtn.closest('.sdvig');
          if (sdvig) this.toggleSingleAnswer(sdvig, false);
          return;
        }

        // 2. Клик по скрытому блоку ответа (.sdvig.answer-hidden)
        const hiddenSdvig = e.target.closest('.sdvig.answer-hidden');
        if (hiddenSdvig) {
          e.preventDefault();
          this.toggleSingleAnswer(hiddenSdvig, true);
          return;
        }

        // 3. Клик по заголовку ответа (.otvet)
        const otvet = e.target.closest('.otvet');
        if (otvet) {
          const nextSdvig = otvet.nextElementSibling;
          if (nextSdvig && nextSdvig.classList.contains('sdvig')) {
            e.preventDefault();
            this.toggleSingleAnswer(nextSdvig);
          }
        }
      });
    }

    document.getElementById('fontSizeBtn')?.addEventListener('click', () => this.cycleFontSize());
    document.getElementById('themeToggleBtn')?.addEventListener('click', () => this.toggleTheme());
    document.getElementById('fullscreenBtn')?.addEventListener('click', () => this.toggleFullScreen());

    // Отслеживание перехода в полноэкранный режим
    document.addEventListener('fullscreenchange', () => {
      this.setFullScreenState(!!document.fullscreenElement);
    });

    if (window.electronAPI && window.electronAPI.onFullScreenChange) {
      window.electronAPI.onFullScreenChange((isFull) => {
        this.setFullScreenState(isFull);
      });
    }

    // Переключатель годов (2020 / 2023)
    document.querySelectorAll('.edition-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const year = btn.getAttribute('data-year');
        this.setEdition(year);
      });
    });

    // Lightbox закрытие
    document.getElementById('lightboxClose')?.addEventListener('click', () => this.closeLightbox());
    document.getElementById('lightboxModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'lightboxModal') this.closeLightbox();
    });

    // Горячие клавиши на клавиатуре (Windows / Mac)
    window.addEventListener('keydown', (e) => {
      const searchResults = document.getElementById('inlineSearchResults');
      const searchInput = document.getElementById('inlineSearchInput');

      if (e.key === 'Escape') {
        if (this.isFullScreen || document.fullscreenElement) {
          e.preventDefault();
          this.exitFullScreen();
          return;
        }
        if (searchResults && searchResults.style.display !== 'none') {
          this.closeInlineSearchResults();
          return;
        }
        if (document.getElementById('numpadModal')?.classList.contains('open')) {
          this.closeNumpad();
          return;
        }
        if (document.getElementById('lightboxModal')?.classList.contains('open')) {
          this.closeLightbox();
          return;
        }
      }

      if (e.key === 'F11') {
        // В браузере перехватываем F11 для переключения состояния
        if (!window.electronAPI) {
          e.preventDefault();
          this.toggleFullScreen();
          return;
        }
      }

      // Зум через клавиатуру Ctrl + / Ctrl - / Ctrl 0
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          if (window.electronAPI && window.electronAPI.zoomIn) {
            e.preventDefault();
            window.electronAPI.zoomIn();
            return;
          }
        } else if (e.key === '-' || e.key === '_') {
          if (window.electronAPI && window.electronAPI.zoomOut) {
            e.preventDefault();
            window.electronAPI.zoomOut();
            return;
          }
        } else if (e.key === '0') {
          if (window.electronAPI && window.electronAPI.resetZoom) {
            e.preventDefault();
            window.electronAPI.resetZoom();
            return;
          }
        }
      }

      if (document.getElementById('numpadModal')?.classList.contains('open')) {
        if (e.key >= '0' && e.key <= '9') this.numpadPress(e.key);
        if (e.key === 'Enter') this.numpadSubmit();
        if (e.key === 'Backspace') this.numpadBackspace();
        return;
      }

      // Не перехватываем горячие клавиши, если фокус в инпуте поиска или страницы
      if (e.target.tagName === 'INPUT') {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prevPage();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.nextPage();
      } else if (e.key === ' ') {
        e.preventDefault();
        this.toggleAnswers();
      } else if ((e.key === 'f' || e.key === 'а') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      } else if ((e.key === 'd' || e.key === 'в' || e.key === 'D' || e.key === 'В') && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        this.toggleTheme();
      }
    });
  }
}

// Запуск приложения после загрузки DOM
window.addEventListener('DOMContentLoaded', () => {
  window.teacherApp = new TeacherApp();
});
