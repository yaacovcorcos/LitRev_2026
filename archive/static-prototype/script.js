document.addEventListener('DOMContentLoaded', () => {
    // console.log('LitRev Dashboard Initialized');

    // --- Search Bar Interaction ---
    const searchInput = document.querySelector('.search-input');
    const searchWrapper = document.querySelector('.search-wrapper');

    if (searchInput && searchWrapper) {
        searchInput.addEventListener('focus', () => {
            searchWrapper.style.transform = 'scale(1.02)';
            searchWrapper.style.transition = 'transform 0.3s ease';
        });

        searchInput.addEventListener('blur', () => {
            searchWrapper.style.transform = 'scale(1)';
        });
    }

    // --- Sidebar Toggle ---
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const aiLayout = document.querySelector('.ai-layout');
    const navLabels = document.querySelectorAll('.sidebar .nav-label');

    function syncAiLayoutPadding() {
        if (!aiLayout) return;
        if (window.location.hash === '#ai-assistant') {
            const isCollapsed = sidebar?.classList.contains('collapsed');
            aiLayout.style.paddingLeft = isCollapsed ? '88px' : '260px';
        } else {
            aiLayout.style.paddingLeft = '';
        }
    }

    function syncProjectLayoutPadding() {
        if (!projectLayout) return;
        if (window.location.hash.startsWith('#project/')) {
            const isCollapsed = sidebar?.classList.contains('collapsed');
            projectLayout.style.paddingLeft = isCollapsed ? '88px' : '260px';
        } else {
            projectLayout.style.paddingLeft = '';
        }
    }

    function setSidebarState(isCollapsed) {
        if (!sidebar) return;
        sidebar.classList.toggle('collapsed', isCollapsed);
        navLabels.forEach(label => {
            label.setAttribute('aria-hidden', isCollapsed ? 'true' : 'false');
        });
        if (sidebarToggle) {
            sidebarToggle.setAttribute('aria-expanded', (!isCollapsed).toString());
            sidebarToggle.setAttribute('aria-label', isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar');
        }
    }

    if (sidebar && sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            const willCollapse = !sidebar.classList.contains('collapsed');
            setSidebarState(willCollapse);
            syncAiLayoutPadding();
            syncProjectLayoutPadding();
        });
    }

    // --- Sort Dropdown Logic ---
    const sortBtn = document.getElementById('sortBtn');
    const sortOptions = document.getElementById('sortOptions');
    const options = document.querySelectorAll('.option');
    const projectGrid = document.querySelector('.project-grid');

    if (sortBtn && sortOptions) {
        // Load saved sort preference and update selection before first render
        const savedSort = localStorage.getItem('litrev_sort_preference');
        if (savedSort) {
            const savedOption = Array.from(options).find(opt => opt.dataset.value === savedSort);
            if (savedOption) {
                options.forEach(opt => opt.classList.remove('selected'));
                savedOption.classList.add('selected');
            }
        }

        // Toggle Dropdown
        sortBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShown = sortOptions.classList.toggle('show');
            sortBtn.setAttribute('aria-expanded', isShown);
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!sortBtn.contains(e.target) && !sortOptions.contains(e.target)) {
                sortOptions.classList.remove('show');
                sortBtn.setAttribute('aria-expanded', 'false');
            }
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sortOptions.classList.contains('show')) {
                sortOptions.classList.remove('show');
                sortBtn.setAttribute('aria-expanded', 'false');
                sortBtn.focus();
            }
        });

        // Sort Selection
        options.forEach(option => {
            option.addEventListener('click', () => {
                // UI Updates
                options.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                sortOptions.classList.remove('show');
                sortBtn.setAttribute('aria-expanded', 'false');

                const sortType = option.dataset.value;
                // console.log('Sorting by:', sortType);

                // Update button text (optional, but good for UX)
                // sortBtn.innerHTML = `<span class="material-icons-round">sort</span> Sort by: ${option.textContent}`;

                // Perform Sorting
                sortProjects(sortType);
            });
        });
    }

    function sortProjects(type) {
        if (!projectGrid) return;

        // Get all project cards (excluding the "New Project" card)
        const cards = Array.from(projectGrid.querySelectorAll('.project-card'));
        const newProjectCard = projectGrid.querySelector('.new-project-card');

        // Save preference
        localStorage.setItem('litrev_sort_preference', type);

        cards.sort((a, b) => {
            // Get values from data attributes or fallback to text content
            const nameA = a.dataset.name ? a.dataset.name.toLowerCase() : a.querySelector('h3').textContent.trim().toLowerCase();
            const nameB = b.dataset.name ? b.dataset.name.toLowerCase() : b.querySelector('h3').textContent.trim().toLowerCase();

            const dateModifiedA = a.dataset.modified ? new Date(a.dataset.modified) : new Date(0);
            const dateModifiedB = b.dataset.modified ? new Date(b.dataset.modified) : new Date(0);

            const dateCreatedA = a.dataset.created ? new Date(a.dataset.created) : new Date(0);
            const dateCreatedB = b.dataset.created ? new Date(b.dataset.created) : new Date(0);

            if (type === 'name') {
                return nameA.localeCompare(nameB);
            } else if (type === 'modified') {
                // Sort descending (newest first)
                return dateModifiedB - dateModifiedA;
            } else if (type === 'created') {
                // Sort descending (newest first)
                return dateCreatedB - dateCreatedA;
            }
            return 0;
        });

        // Re-append cards in new order
        // We use a DocumentFragment to minimize reflows
        const fragment = document.createDocumentFragment();

        // Always keep "New Project" first if it exists
        if (newProjectCard) fragment.appendChild(newProjectCard);

        cards.forEach(card => fragment.appendChild(card));

        // Clear grid and append sorted fragment
        projectGrid.innerHTML = '';
        projectGrid.appendChild(fragment);
    }

    // --- View Toggle Logic & Persistence ---
    const gridViewBtn = document.getElementById('gridViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');

    function setView(view) {
        if (!projectGrid || !gridViewBtn || !listViewBtn) return;

        if (view === 'list') {
            projectGrid.classList.add('list-view');
            listViewBtn.classList.add('active');
            gridViewBtn.classList.remove('active');
            listViewBtn.setAttribute('aria-pressed', 'true');
            gridViewBtn.setAttribute('aria-pressed', 'false');
        } else {
            projectGrid.classList.remove('list-view');
            gridViewBtn.classList.add('active');
            listViewBtn.classList.remove('active');
            gridViewBtn.setAttribute('aria-pressed', 'true');
            listViewBtn.setAttribute('aria-pressed', 'false');
        }
        localStorage.setItem('litrev_view_preference', view);
    }

    if (gridViewBtn && listViewBtn && projectGrid) {
        // Load preference
        const savedView = localStorage.getItem('litrev_view_preference');
        if (savedView) {
            setView(savedView);
        }

        gridViewBtn.addEventListener('click', () => setView('grid'));
        listViewBtn.addEventListener('click', () => setView('list'));
    }

    // --- Project Data Service (Mimics API) ---
    const ProjectService = {
        STORAGE_KEY: 'litrev_projects_v1', // Versioned key

        // Default Seed Data
        defaultProjects: [
            {
                id: 'p1',
                name: 'Machine Learning in Radiopathology 2020-2025',
                status: 'harvesting',
                statusText: 'Status: Harvesting papers...',
                progress: { phase: 'Phase 2 of 4: Deduplicating', percent: 45, papers: 27 },
                modified: '2025-11-24T14:00:00',
                created: '2025-11-20'
            },
            {
                id: 'p2',
                name: 'Climate Change Adaptation Strategies in Urban Planning',
                status: 'ready',
                statusText: 'Status: Review Ready',
                papers: 154,
                modified: '2025-11-23T10:00:00',
                created: '2025-11-15'
            },
            {
                id: 'p3',
                name: 'CRISPR Applications in Neurodegenerative Diseases',
                status: 'ready',
                statusText: 'Status: Review Ready',
                papers: 89,
                modified: '2025-11-22T16:30:00',
                created: '2025-11-18'
            },
            {
                id: 'p4',
                name: 'Sustainable Supply Chain Management in Fashion',
                status: 'ready',
                statusText: 'Status: Review Ready',
                papers: 210,
                modified: '2025-11-21T09:15:00',
                created: '2025-11-10'
            },
            {
                id: 'p5',
                name: 'Impact of Remote Work on Employee Productivity',
                status: 'ready',
                statusText: 'Status: Review Ready',
                papers: 132,
                modified: '2025-11-19T14:45:00',
                created: '2025-11-05'
            }
        ],

        async getAll() {
            // Simulate network delay
            // await new Promise(resolve => setTimeout(resolve, 100));
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                return JSON.parse(stored);
            } else {
                // Seed defaults
                this.save(this.defaultProjects);
                return [...this.defaultProjects];
            }
        },

        async getById(id) {
            const projects = await this.getAll();
            return projects.find(p => p.id === id);
        },

        async create(project) {
            const projects = await this.getAll();
            projects.unshift(project);
            this.save(projects);
            return project;
        },

        save(projects) {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(projects));
        }
    };

    async function renderProjects() {
        if (!projectGrid) return;

        const projects = await ProjectService.getAll();

        // Clear existing cards except "New Project" (which we'll re-add)
        projectGrid.innerHTML = '';

        const fragment = document.createDocumentFragment();

        // Add "New Project" Card
        const newCard = document.createElement('div');
        newCard.className = 'card new-project-card';
        newCard.setAttribute('role', 'button');
        newCard.setAttribute('tabindex', '0');
        newCard.setAttribute('aria-label', 'Create New Project');
        newCard.innerHTML = `
            <div class="new-project-content">
                <div class="icon-circle">
                    <span class="plus-icon">+</span>
                </div>
                <h3>Create New Project</h3>
                <p>Start a new Literature Review</p>
            </div>
        `;
        // Re-attach listeners
        newCard.addEventListener('click', openCreateModal);
        newCard.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openCreateModal();
            }
        });
        fragment.appendChild(newCard);

        // Render Projects
        projects.forEach(p => {
            const card = document.createElement('div');
            card.className = `card project-card ${p.status === 'harvesting' ? 'active-review' : ''}`;
            card.dataset.name = p.name;
            card.dataset.modified = p.modified;
            card.dataset.created = p.created;
            card.dataset.id = p.id;

            let contentHtml = `
                <div class="card-status status-${p.status}">
                    ${p.statusText}
                </div>
                <h3>${p.name}</h3>
            `;

            if (p.status === 'harvesting') {
                contentHtml += `
                    <div class="progress-section">
                        <div class="progress-text">
                            <span>${p.progress.phase}</span>
                            <span class="percentage">${p.progress.percent}%</span>
                        </div>
                        <div class="progress-row">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${p.progress.percent}%"></div>
                            </div>
                            <div class="paper-count-inline">${p.progress.papers} Papers</div>
                        </div>
                        <p class="meta-info">Last modified recently.</p>
                    </div>
                `;
            } else {
                contentHtml += `<div class="paper-count-bottom">${p.papers} Papers</div>`;
            }

            // Update to use hash link for semantic navigation
            contentHtml += `<a href="#project/${p.id}" class="btn btn-primary view-project-btn" data-id="${p.id}">View Project</a>`;

            card.innerHTML = contentHtml;

            // Card click listener (delegation to link)
            card.addEventListener('click', (e) => {
                // If user clicked the button/link directly, let it handle it
                if (e.target.closest('.view-project-btn')) return;

                // Otherwise navigate programmatically
                window.location.hash = `#project/${p.id}`;
            });

            fragment.appendChild(card);
        });

        projectGrid.appendChild(fragment);

        // Re-apply current sort
        const currentSort = document.querySelector('.option.selected');
        if (currentSort) {
            sortProjects(currentSort.dataset.value);
        }
    }

    // --- Modal Logic ---
    const modal = document.getElementById('createProjectModal');
    const form = document.getElementById('createProjectForm');
    const cancelBtn = document.querySelector('.cancel-btn');
    const closeModalBtn = document.querySelector('.close-modal-btn');
    let lastFocusedElement;
    let trapFocusHandler;

    function openCreateModal() {
        if (modal) {
            lastFocusedElement = document.activeElement;
            modal.classList.add('active');
            document.body.style.overflow = 'hidden'; // Lock background scroll

            // Focus Trap
            const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            trapFocusHandler = function (e) {
                if (e.key === 'Tab') {
                    if (e.shiftKey) { // Shift + Tab
                        if (document.activeElement === firstElement) {
                            e.preventDefault();
                            lastElement.focus();
                        }
                    } else { // Tab
                        if (document.activeElement === lastElement) {
                            e.preventDefault();
                            firstElement.focus();
                        }
                    }
                } else if (e.key === 'Escape') {
                    closeCreateModal();
                }
            };

            modal.addEventListener('keydown', trapFocusHandler);

            // Focus first input
            const input = document.getElementById('projectName');
            if (input) input.focus();
        }
    }

    function closeCreateModal() {
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = ''; // Restore scroll
            if (form) form.reset();
            if (trapFocusHandler) {
                modal.removeEventListener('keydown', trapFocusHandler);
                trapFocusHandler = null;
            }
            if (lastFocusedElement) lastFocusedElement.focus();
        }
    }

    if (cancelBtn) cancelBtn.addEventListener('click', closeCreateModal);
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeCreateModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeCreateModal();
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('projectName').value;
            const desc = document.getElementById('projectDesc').value; // Saved but not displayed on card yet

            const newProject = {
                id: 'p' + Date.now(),
                name: name,
                description: desc,
                status: 'ready', // Default status
                statusText: 'Status: Review Ready',
                papers: 0,
                modified: new Date().toISOString(),
                created: new Date().toISOString()
            };

            await ProjectService.create(newProject);
            renderProjects();
            closeCreateModal();

            // Optional: Auto-open new project
            // window.location.hash = `#project/${newProject.id}`;
        });
    }

    // --- AI Assistant Logic ---
    const aiView = document.getElementById('ai-view');
    // sidebar is already defined at top level
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');
    const chatSidebarToggle = document.querySelector('.chat-sidebar-toggle');
    const chatHistorySidebar = document.querySelector('.chat-history-sidebar');
    const toneOptions = document.querySelectorAll('.tone-option');
    const toneWrapper = document.querySelector('.tone-toggle-wrapper');
    const projectSidebarToggle = document.querySelector('.project-sidebar-toggle');
    const projectSidebar = document.querySelector('.project-sidebar');
    const projectSidebarTitle = document.getElementById('projectSidebarTitle');
    const projectSidebarDesc = document.getElementById('projectSidebarDesc');
    const projectLayout = document.querySelector('.project-layout');

    if (chatSidebarToggle && chatHistorySidebar) {
        chatSidebarToggle.setAttribute('aria-expanded', 'true');
        chatHistorySidebar.setAttribute('aria-hidden', 'false');
        chatSidebarToggle.addEventListener('click', () => {
            const isCollapsed = chatHistorySidebar.classList.toggle('collapsed');
            chatSidebarToggle.setAttribute('aria-expanded', (!isCollapsed).toString());
            chatHistorySidebar.setAttribute('aria-hidden', isCollapsed.toString());
        });
    }

    if (projectSidebarToggle && projectSidebar) {
        projectSidebarToggle.addEventListener('click', () => {
            const willCollapse = !projectSidebar.classList.contains('collapsed');
            projectSidebar.classList.toggle('collapsed', willCollapse);
            projectSidebarToggle.setAttribute('aria-expanded', (!willCollapse).toString());
            projectSidebarToggle.setAttribute('aria-label', willCollapse ? 'Expand Project Sidebar' : 'Collapse Project Sidebar');
            projectSidebar.setAttribute('aria-hidden', willCollapse.toString());
        });
    }

    if (toneOptions && toneWrapper) {
        toneOptions.forEach(option => {
            option.addEventListener('click', () => {
                // Remove active from all
                toneOptions.forEach(opt => opt.classList.remove('active'));
                // Add active to clicked
                option.classList.add('active');

                // Handle slider position
                if (option.dataset.tone === 'deep') {
                    toneWrapper.classList.add('deep-active');
                } else {
                    toneWrapper.classList.remove('deep-active');
                }
            });
        });
    }

    // AIService Stub
    const AIService = {
        async sendMessage(text) {
            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

            // Simple echo/canned response logic
            const lowerText = text.toLowerCase();
            if (lowerText.includes('hello') || lowerText.includes('hi')) {
                return "Hello! I'm ready to help with your literature review. What are you working on?";
            } else if (lowerText.includes('summarize')) {
                return "I can certainly help summarize that. Please upload the PDF or paste the text you'd like me to analyze.";
            } else if (lowerText.includes('find papers')) {
                return "I can search for papers. What specific keywords or topics should I focus on?";
            } else {
                return "That's an interesting point. Could you elaborate on how this relates to your current research objectives?";
            }
        }
    };

    function appendMessage(text, isUser) {
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${isUser ? 'user-msg' : 'ai-msg'}`;

        let content = '';
        if (isUser) {
            content = `
                <div class="message-content">
                    <p>${text}</p>
                </div>
            `;
        } else {
            content = `
                <div class="ai-avatar">
                    <span class="material-icons-round">smart_toy</span>
                </div>
                <div class="message-content">
                    <p>${text}</p>
                </div>
            `;
        }

        bubble.innerHTML = content;
        chatMessages.appendChild(bubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    if (chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (!text) return;

            // User Message
            appendMessage(text, true);
            chatInput.value = '';

            // AI Response (Typing indicator could go here)
            const response = await AIService.sendMessage(text);
            appendMessage(response, false);
        });
    }

    // --- Routing & Navigation ---
    const appContainer = document.querySelector('.app-container');
    const projectView = document.getElementById('project-view');
    const projectTitleDisplay = document.getElementById('projectTitleDisplay');
    const projectDescDisplay = document.getElementById('projectDescDisplay');
    const deleteProjectBtn = document.getElementById('deleteProjectBtn');
    const mainNavItems = document.querySelectorAll('.main-nav .nav-item[data-nav]');
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item[data-nav]');
    const mobileNewNav = document.querySelector('.mobile-nav-item[data-nav="new"]');

    function setActiveNav(target) {
        mainNavItems.forEach(item => {
            item.classList.toggle('active', item.dataset.nav === target);
        });
        mobileNavItems.forEach(item => {
            item.classList.toggle('active', item.dataset.nav === target);
        });
    }

    if (mobileNewNav) {
        mobileNewNav.addEventListener('click', (e) => {
            e.preventDefault();
            openCreateModal();
        });
    }

    async function handleRouting() {
        const hash = window.location.hash;

        // Reset Views
        if (projectView) projectView.classList.add('hidden');
        if (aiView) aiView.classList.add('hidden');
        if (appContainer) appContainer.style.display = 'flex';

        if (hash === '#ai-assistant') {
            // AI Assistant View
            if (aiView) aiView.classList.remove('hidden');
            setSidebarState(true);
            setActiveNav('ai');
            syncAiLayoutPadding();
        } else if (hash.startsWith('#project/')) {
            const id = hash.split('/')[1];
            if (!id) {
                window.location.hash = '';
                return;
            }

            const project = await ProjectService.getById(id);

            if (project) {
                setSidebarState(true);
                showProjectView(project);
                setActiveNav('projects');
                syncProjectLayoutPadding();
            } else {
                console.warn('Project not found:', id);
                window.location.hash = ''; // Redirect to dashboard
            }
        } else if (hash === '#library') {
            // Placeholder: no dedicated view, fall back to dashboard but highlight nav
            showDashboard();
            setActiveNav('library');
            setSidebarState(false);
            syncAiLayoutPadding();
        } else {
            // Default: Dashboard
            showDashboard();
            setActiveNav('projects');
            setSidebarState(false);
            syncAiLayoutPadding();
            syncProjectLayoutPadding();
        }
    }

    function showDashboard() {
        // Ensure grid is rendered
        renderProjects();
    }

    function showProjectView(project) {
        if (projectView && projectTitleDisplay) {
            projectTitleDisplay.textContent = project.name;
            projectDescDisplay.textContent = project.description || 'No description provided.';
            if (deleteProjectBtn) deleteProjectBtn.dataset.projectId = project.id;
            if (projectSidebarTitle) projectSidebarTitle.textContent = project.name;
            if (projectSidebarDesc) projectSidebarDesc.textContent = project.description || 'No description provided.';
            if (projectSidebar) projectSidebar.classList.remove('collapsed');
            if (projectSidebarToggle) {
                projectSidebarToggle.setAttribute('aria-expanded', 'true');
                projectSidebarToggle.setAttribute('aria-label', 'Collapse Project Sidebar');
            }
            if (projectSidebar) {
                projectSidebar.setAttribute('aria-hidden', 'false');
            }
            syncProjectLayoutPadding();

            projectView.classList.remove('hidden');
            window.scrollTo(0, 0);
        }
    }

    // Back button handler (updates hash)
    const backBtn = document.getElementById('backToDashboardBtn');
    const backActionBtn = document.getElementById('backToDashAction');

    function navigateToDashboard(e) {
        e.preventDefault();
        window.location.hash = '';
    }

    if (backBtn) backBtn.addEventListener('click', navigateToDashboard);
    if (backActionBtn) backActionBtn.addEventListener('click', navigateToDashboard);

    if (deleteProjectBtn) {
        deleteProjectBtn.addEventListener('click', async () => {
            const id = deleteProjectBtn.dataset.projectId;
            if (!id) return;
            const confirmed = window.confirm('Delete this project?');
            if (!confirmed) return;
            const projects = await ProjectService.getAll();
            const filtered = projects.filter(p => p.id !== id);
            ProjectService.save(filtered);
            window.location.hash = '';
            renderProjects();
        });
    }

    // Initialize Router
    window.addEventListener('hashchange', handleRouting);
    window.addEventListener('resize', () => {
        syncAiLayoutPadding();
        syncProjectLayoutPadding();
    });

    // Initial Load
    handleRouting();

});
