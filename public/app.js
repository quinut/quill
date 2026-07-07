// 상태 관리
let allQuotes = [];
let currentGuildFilter = '';
let currentSearchQuery = '';

// DOM 요소 캐싱
const quotesGrid = document.getElementById('quotes-grid');
const searchInput = document.getElementById('search-input');
const serverFilter = document.getElementById('server-filter');
const quoteCount = document.getElementById('quote-count');
const galleryTitle = document.getElementById('gallery-title');

// 모달 요소 캐싱
const modal = document.getElementById('quote-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalImg = document.getElementById('modal-img');
const modalAuthorAvatar = document.getElementById('modal-author-avatar');
const modalAuthorName = document.getElementById('modal-author-name');
const modalServerName = document.getElementById('modal-server-name');
const modalQuoteText = document.getElementById('modal-quote-text');
const modalDate = document.getElementById('modal-date');
const downloadBtn = document.getElementById('download-btn');
const copyLinkBtn = document.getElementById('copy-link-btn');

// API를 통해 데이터 로드
async function fetchQuotes(search = '', guildId = '') {
  try {
    let url = '/api/quotes';
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (guildId) params.append('guild_id', guildId);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error('API request failed');
    
    const result = await response.json();
    return result.success ? result.data : [];
  } catch (error) {
    console.error('Error fetching quotes:', error);
    return [];
  }
}

// 갤러리 카드 렌더링
function renderQuotes(quotes) {
  quotesGrid.innerHTML = '';
  
  if (quotes.length === 0) {
    quotesGrid.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-ghost"></i>
        <h3>전시된 명언이 없습니다</h3>
        <p>검색어를 변경하거나 새로운 명언을 박제해보세요!</p>
      </div>
    `;
    quoteCount.textContent = '0개 소장';
    return;
  }

  quoteCount.textContent = `${quotes.length}개 소장`;

  quotes.forEach(quote => {
    const card = document.createElement('div');
    card.className = 'quote-card';
    
    // YYYY. MM. DD 포맷 파싱 또는 기본값 사용
    const dateDisplay = quote.created_at ? quote.created_at.substring(0, 10).replace(/-/g, '. ') : '';

    card.innerHTML = `
      <div class="card-image-wrapper">
        <img src="${quote.image_path}" alt="명언 이미지" loading="lazy">
      </div>
      <div class="card-info">
        <div class="card-author">
          <img src="${quote.author_avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="${quote.author_name}" class="author-avatar">
          <span class="author-name">${quote.author_name}</span>
          <span class="server-tag">${quote.guild_name || 'DM'}</span>
        </div>
        <p class="card-quote-preview">“ ${quote.content} ”</p>
        <div class="card-meta">
          <span>${dateDisplay}</span>
        </div>
      </div>
    `;

    // 카드 클릭 이벤트: 모달 표시
    card.addEventListener('click', () => openModal(quote));
    quotesGrid.appendChild(card);
  });
}

// 필터 드롭다운 초기화
function populateFilters(quotes) {
  // 이미 값이 선택되어 있으면 드롭다운을 재생성하지 않고 유지
  const previousValue = serverFilter.value;
  
  // 고유한 서버 목록 추출 (guild_id가 있고 guild_name이 있는 것들)
  const servers = [];
  const seenIds = new Set();

  quotes.forEach(q => {
    if (q.guild_id && !seenIds.has(q.guild_id)) {
      seenIds.add(q.guild_id);
      servers.push({
        id: q.guild_id,
        name: q.guild_name || 'Unknown Server'
      });
    }
  });

  // 셀렉트 박스 리셋
  serverFilter.innerHTML = '<option value="">모든 디스코드 서버</option>';
  
  servers.forEach(server => {
    const option = document.createElement('option');
    option.value = server.id;
    option.textContent = server.name;
    serverFilter.appendChild(option);
  });

  // 이전 선택 값 복구
  if (seenIds.has(previousValue)) {
    serverFilter.value = previousValue;
  }
}

// 모달 열기
function openModal(quote) {
  modalImg.src = quote.image_path;
  modalAuthorAvatar.src = quote.author_avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';
  modalAuthorName.textContent = quote.author_name;
  modalServerName.textContent = quote.guild_name || 'DM';
  modalQuoteText.textContent = `“ ${quote.content} ”`;
  
  const dateDisplay = quote.created_at ? quote.created_at.substring(0, 10).replace(/-/g, '. ') : '';
  modalDate.textContent = dateDisplay;
  
  // 다운로드 및 복사 버튼 설정
  downloadBtn.href = quote.image_path;
  downloadBtn.setAttribute('download', `${quote.author_name}_명언_${quote.id.substring(0,8)}.png`);
  
  // 클립보드 복사용 절대 경로 생성
  const absoluteUrl = window.location.origin + quote.image_path;
  copyLinkBtn.onclick = () => {
    navigator.clipboard.writeText(absoluteUrl).then(() => {
      const originalText = copyLinkBtn.innerHTML;
      copyLinkBtn.innerHTML = '<i class="fa-solid fa-check"></i> 복사 완료!';
      copyLinkBtn.style.borderColor = 'var(--gold-primary)';
      copyLinkBtn.style.color = 'var(--gold-primary)';
      
      setTimeout(() => {
        copyLinkBtn.innerHTML = originalText;
        copyLinkBtn.style.borderColor = '';
        copyLinkBtn.style.color = '';
      }, 2000);
    }).catch(err => {
      console.error('Link copy failed:', err);
    });
  };

  modal.classList.add('show');
  document.body.style.overflow = 'hidden'; // 뒷배경 스크롤 방지
}

// 모달 닫기
function closeModal() {
  modal.classList.remove('show');
  document.body.style.overflow = '';
}

// 디바운스 함수 (검색어 입력 딜레이 처리)
function debounce(func, delay = 300) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

// 데이터 업데이트 핸들러
async function updateGallery() {
  const quotes = await fetchQuotes(currentSearchQuery, currentGuildFilter);
  renderQuotes(quotes);
  
  // 검색어와 무관하게 고유 서버 리스트를 채우기 위해 최초 로드 혹은 전체 데이터 기반의 필터 세팅이 필요할 수 있음
  // 여기서는 로딩 시 최초 1회만 필터를 채우는 방식을 사용하거나, 매 업데이트 시 필터를 갱신하되 현재 값을 보존
  if (!currentSearchQuery && !currentGuildFilter) {
    populateFilters(quotes);
  }
}

// 이벤트 리스너 등록
searchInput.addEventListener('input', debounce((e) => {
  currentSearchQuery = e.target.value.trim();
  galleryTitle.textContent = currentSearchQuery ? `"${currentSearchQuery}" 검색 결과` : '모든 소장품';
  updateGallery();
}));

serverFilter.addEventListener('change', (e) => {
  currentGuildFilter = e.target.value;
  updateGallery();
});

modalCloseBtn.addEventListener('click', closeModal);

// 모달 외부 클릭 시 닫기
window.addEventListener('click', (e) => {
  if (e.target === modal) {
    closeModal();
  }
});

// ESC 키 입력 시 모달 닫기
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('show')) {
    closeModal();
  }
});

// 초기화 실행
async function init() {
  const quotes = await fetchQuotes();
  renderQuotes(quotes);
  populateFilters(quotes);
}

document.addEventListener('DOMContentLoaded', init);
