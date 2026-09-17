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
      this.searchIndex = index;
    });

    // Проверка статуса офлайн-синхронизации
    this.checkSyncStatus();
  }

  initServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker зарегистрирован:', reg.scope))
        .catch(err => console.warn('Ошибка Service Worker:', err));
    }
  }

  loadSavedSettings() {
    const savedFont = localStorage.getItem('teacher_font_size');
    if (savedFont) {
      this.fontSizeIndex = parseInt(savedFont, 10);
      document.body.classList.remove(...this.fontSizes);
      document.body.classList.add(this.fontSizes[this.fontSizeIndex]);
    }

    const savedHide = localStorage.getItem('teacher_hide_answers');
    if (savedHide === 'true') {
      this.toggleAnswers(true);
    }
  }

  async checkSyncStatus() {
    const isSynced = await window.appStorage.isFullySynced();
    const btn = document.getElementById('syncBtn');
    if (btn) {
      if (isSynced) {
        btn.innerHTML = '<span>⚡</span> Офлайн готов';
        btn.classList.add('primary');
      } else {
        btn.innerHTML = '<span>📲</span> Скачать на iPad';
      }
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
        btn.innerHTML = '<span>👁</span> Показать ответы';
        btn.classList.remove('active');
      } else {
        btn.innerHTML = '<span>🙈</span> Скрыть ответы';
        btn.classList.add('active');
      }
    }
    localStorage.setItem('teacher_hide_answers', this.answersHidden);
  }

  cycleFontSize() {
    document.body.classList.remove(this.fontSizes[this.fontSizeIndex]);
    this.fontSizeIndex = (this.fontSizeIndex + 1) % this.fontSizes.length;
    document.body.classList.add(this.fontSizes[this.fontSizeIndex]);
    localStorage.setItem('teacher_font_size', this.fontSizeIndex);
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

  // ================= ПОИСК ПО ТЕМАМ И ТЕКСТУ =================
  openSearch() {
    const modal = document.getElementById('searchModal');
    const input = document.getElementById('searchField');
    if (modal) modal.classList.add('open');
    if (input) {
      input.value = '';
      input.focus();
      this.renderSearchResults([]);
    }
  }

  closeSearch() {
    const modal = document.getElementById('searchModal');
    if (modal) modal.classList.remove('open');
  }

  handleSearch(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      this.renderSearchResults([]);
      return;
    }

    const isNum = !isNaN(parseInt(q, 10));
    const qNum = isNum ? parseInt(q, 10) : null;

    const results = this.searchIndex.filter(item => {
      if (qNum !== null && item.page === qNum) return true;
      if (item.topics && item.topics.some(t => t.toLowerCase().includes(q))) return true;
      if (item.snippet && item.snippet.toLowerCase().includes(q)) return true;
      return false;
    }).slice(0, 25);

    this.renderSearchResults(results, q);
  }

  renderSearchResults(results, query = '') {
    const listEl = document.getElementById('searchResultsList');
    if (!listEl) return;

    if (!query) {
      listEl.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Введите номер страницы или название темы...</div>';
      return;
    }

    if (results.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Ничего не найдено</div>';
      return;
    }

    listEl.innerHTML = results.map(item => `
      <div class="search-item" data-book="${item.bookId}" data-part="${item.part}" data-page="${item.page}">
        <div class="search-item-header">
          <span class="search-item-book">${item.bookTitle} (ч. ${item.part})</span>
          <span class="search-item-page">Стр. ${item.page}</span>
        </div>
        ${item.topics && item.topics.length ? `<div class="search-item-topic">📌 ${item.topics.join(', ')}</div>` : ''}
        <div class="search-item-snippet">${item.snippet}...</div>
      </div>
    `).join('');

    listEl.querySelectorAll('.search-item').forEach(el => {
      el.addEventListener('click', async () => {
        const bId = el.getAttribute('data-book');
        const part = parseInt(el.getAttribute('data-part'), 10);
        const page = parseInt(el.getAttribute('data-page'), 10);

        this.closeSearch();
        if (this.currentBookId !== bId) {
          await this.selectBook(bId);
        }
        if (this.currentPart !== part) {
          this.selectPart(part);
        }
        this.goToPage(page);
      });
    });
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

  // ================= ПОЛНАЯ ОФЛАЙН-СИНХРОНИЗАЦИЯ =================
  startOfflineSync() {
    const modal = document.getElementById('syncModal');
    const progressFill = document.getElementById('syncProgressFill');
    const progressLabel = document.getElementById('syncProgressLabel');
    const closeBtn = document.getElementById('syncCloseBtn');

    if (modal) modal.classList.add('open');
    if (closeBtn) closeBtn.style.display = 'none';

    window.appStorage.syncAll((event) => {
      if (progressLabel) progressLabel.textContent = event.text;

      if (event.total && event.current) {
        const pct = Math.round((event.current / event.total) * 100);
        if (progressFill) progressFill.style.width = `${pct}%`;
      }

      if (event.status === 'done') {
        if (progressFill) progressFill.style.width = '100%';
        if (closeBtn) closeBtn.style.display = 'inline-block';
        this.checkSyncStatus();
      }
    });
  }

  closeSyncModal() {
    const modal = document.getElementById('syncModal');
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

    // Учительские кнопки: Скрытие ответов, шрифт, синхронизация
    document.getElementById('toggleAnswersBtn')?.addEventListener('click', () => this.toggleAnswers());
    document.getElementById('fontSizeBtn')?.addEventListener('click', () => this.cycleFontSize());
    document.getElementById('syncBtn')?.addEventListener('click', () => this.startOfflineSync());
    document.getElementById('syncCloseBtn')?.addEventListener('click', () => this.closeSyncModal());

    // Переключатель годов (2020 / 2023)
    document.querySelectorAll('.edition-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const year = btn.getAttribute('data-year');
        this.setEdition(year);
      });
    });

    // Поиск
    document.getElementById('searchTriggerBtn')?.addEventListener('click', () => this.openSearch());
    document.getElementById('searchCloseBtn')?.addEventListener('click', () => this.closeSearch());
    document.getElementById('searchField')?.addEventListener('input', (e) => this.handleSearch(e.target.value));
    document.getElementById('searchModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'searchModal') this.closeSearch();
    });

    // Lightbox закрытие
    document.getElementById('lightboxClose')?.addEventListener('click', () => this.closeLightbox());
    document.getElementById('lightboxModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'lightboxModal') this.closeLightbox();
    });

    // Горячие клавиши на клавиатуре (Windows)
    window.addEventListener('keydown', (e) => {
      // Если открыт поиск или модалки, не перехватываем
      if (document.getElementById('searchModal')?.classList.contains('open')) {
        if (e.key === 'Escape') this.closeSearch();
        return;
      }
      if (document.getElementById('numpadModal')?.classList.contains('open')) {
        if (e.key === 'Escape') this.closeNumpad();
        if (e.key >= '0' && e.key <= '9') this.numpadPress(e.key);
        if (e.key === 'Enter') this.numpadSubmit();
        if (e.key === 'Backspace') this.numpadBackspace();
        return;
      }
      if (document.getElementById('lightboxModal')?.classList.contains('open')) {
        if (e.key === 'Escape') this.closeLightbox();
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prevPage();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.nextPage();
      } else if (e.key === ' ' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        this.toggleAnswers();
      } else if ((e.key === 'f' || e.key === 'а') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.openSearch();
      }
    });
  }
}

// Запуск приложения после загрузки DOM
window.addEventListener('DOMContentLoaded', () => {
  window.teacherApp = new TeacherApp();
});
