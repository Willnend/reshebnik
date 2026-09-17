/**
 * app.js - Главный модуль логики интерфейса учителя.
 */

class TeacherApp {
  constructor() {
    this.catalog = [];
    this.currentBookId = 'math';
    this.currentBook = null;
    this.currentPart = 1;
    this.currentPage = 4;
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
    this.renderBooksNav();

    // Загрузка первого учебника
    await this.loadBook(this.currentBookId);

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
  }

  renderBooksNav() {
    const navEl = document.getElementById('booksNav');
    if (!navEl) return;

    navEl.innerHTML = this.catalog.map(b => `
      <button class="book-tab ${b.id === this.currentBookId ? 'active' : ''}" data-id="${b.id}">
        <span class="book-tab-icon">${b.icon || '📖'}</span>
        <span>${b.title}</span>
      </button>
    `).join('');

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

  async loadBook(bookId) {
    this.showLoading();
    this.currentBook = await window.appStorage.getBook(bookId);
    if (!this.currentBook) {
      this.showError(`Не удалось загрузить данные учебника`);
      return;
    }

    // Рендерим селектор частей
    this.renderPartsSelector();

    // Выбираем доступную часть
    const parts = Object.keys(this.currentBook.parts).map(Number);
    this.currentPart = parts.includes(this.currentPart) ? this.currentPart : parts[0];
    this.updatePartsUI();

    // Выбираем начальную страницу
    const pageList = this.getCurrentPartPageList();
    if (pageList.length > 0) {
      this.goToPage(pageList[0]);
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

    if (pageInput) pageInput.value = this.currentPage;
    if (pageTotalEl) pageTotalEl.textContent = `/ ${maxPage}`;

    if (metaTitleEl) {
      metaTitleEl.textContent = `${this.currentBook.title} 1 класс • Часть ${this.currentPart}`;
    }

    if (pageHeadingEl) {
      pageHeadingEl.textContent = `Страница ${page.pageNumber}`;
    }

    if (topicsEl) {
      if (page.topics && page.topics.length > 0) {
        topicsEl.innerHTML = page.topics.map(t => `<span class="page-topic-tag">📌 ${t}</span>`).join(' ');
        topicsEl.style.display = 'block';
      } else {
        topicsEl.style.display = 'none';
      }
    }

    // Обработка переключателя годов (2020 / 2023)
    if (editionBoxEl) {
      if (page.hasEditions && page.editionData) {
        editionBoxEl.style.display = 'flex';
        this.renderEditionContent(page);
      } else {
        editionBoxEl.style.display = 'none';
        contentEl.innerHTML = page.contentHtml;
      }
    } else {
      contentEl.innerHTML = page.contentHtml;
    }

    // Инициализируем переключатели способов решения (№1, №2...)
    this.initTabs(contentEl);

    // Навешиваем зум на картинки
    contentEl.querySelectorAll('img').forEach(img => {
      img.addEventListener('click', () => {
        this.openLightbox(img.src);
      });
    });
  }

  renderEditionContent(page) {
    const contentEl = document.getElementById('pageContent');
    if (!page.editionData) {
      contentEl.innerHTML = page.contentHtml;
      this.initTabs(contentEl);
      return;
    }

    let edHtml = '';
    if (this.selectedEdition === '2023' && page.editionData.year2023) {
      edHtml = page.editionData.year2023;
    } else if (page.editionData.year2020) {
      edHtml = page.editionData.year2020;
    } else {
      edHtml = page.contentHtml;
    }

    // Если есть общий контент страницы после вкладок, добавляем его
    contentEl.innerHTML = edHtml;
    this.initTabs(contentEl);
    contentEl.querySelectorAll('img').forEach(img => {
      img.addEventListener('click', () => {
        this.openLightbox(img.src);
      });
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

  setEdition(year) {
    this.selectedEdition = year;
    document.querySelectorAll('.edition-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-year') === year);
    });
    if (this.currentBook) {
      const page = this.currentBook.parts[this.currentPart].pages[this.currentPage];
      if (page) this.renderEditionContent(page);
    }
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

  toggleAnswers(forceState) {
    if (typeof forceState === 'boolean') {
      this.answersHidden = forceState;
    } else {
      this.answersHidden = !this.answersHidden;
    }

    document.body.classList.toggle('hide-answers', this.answersHidden);
    const btn = document.getElementById('toggleAnswersBtn');
    if (btn) {
      if (this.answersHidden) {
        btn.innerHTML = '<span class="tool-btn-icon">👁</span> <span class="tool-btn-text"><span class="tool-label-action">Показать</span><span class="tool-label-extra"> ответы</span></span>';
        btn.classList.remove('active');
      } else {
        btn.innerHTML = '<span class="tool-btn-icon">🙈</span> <span class="tool-btn-text"><span class="tool-label-action">Скрыть</span><span class="tool-label-extra"> ответы</span></span>';
        btn.classList.add('active');
      }
    }
    localStorage.setItem('teacher_hide_answers', this.answersHidden);
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
      btn.innerHTML = `<span class="tool-btn-icon">🔠</span> <span class="tool-btn-text"><span class="tool-label-extra">Шрифт </span><span class="font-badge">${label}</span></span>`;
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
        ? '<span class="theme-icon tool-btn-icon">☀️</span> <span class="theme-label tool-btn-text">Светлая</span>'
        : '<span class="theme-icon tool-btn-icon">🌙</span> <span class="theme-label tool-btn-text">Тёмная</span>';
      btn.title = isDark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему для вечерней работы';
    }

    // Обновляем цвет статус-бара iOS / браузера
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#0B0F19' : '#2563EB');
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
        btn.innerHTML = '<span class="fs-icon tool-btn-icon">🗗</span> <span class="fs-label tool-btn-text">Свернуть</span>';
        btn.classList.add('active-fullscreen');
        btn.title = 'Свернуть полноэкранный режим (Esc / F11)';
      } else {
        btn.innerHTML = '<span class="fs-icon tool-btn-icon">⛶</span> <span class="fs-label tool-btn-text">Экран</span>';
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
        this.updatePartsUI();
        this.goToPage(pageNum);
        return;
      }
    }

    alert(`Страница ${pageNum} не найдена в текущем учебнике`);
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
          topics: ['⚡ Быстрый переход на страницу'],
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
        ${item.topics && item.topics.length ? `<div class="dropdown-item-topic">📌 ${this.escapeHtml(item.topics.join(', '))}</div>` : ''}
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
    if (content) content.innerHTML = `<div style="text-align:center; padding: 40px; color: #DC2626;">${msg}</div>`;
  }

  showEmptyState() {
    const content = document.getElementById('pageContent');
    if (content) content.innerHTML = '<div style="text-align:center; padding: 40px;">В этой части нет доступных страниц</div>';
  }

  setupEventListeners() {
    // Переход назад/вперед
    document.getElementById('prevPageBtn')?.addEventListener('click', () => this.prevPage());
    document.getElementById('nextPageBtn')?.addEventListener('click', () => this.nextPage());

    // Прямой ввод номера страницы в шапке
    const pageInput = document.getElementById('pageInput');
    if (pageInput) {
      pageInput.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) this.jumpToPage(val);
      });
      // По клику на мобильных/iPad открываем крупный numpad
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
