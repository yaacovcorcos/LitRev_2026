document.addEventListener('DOMContentLoaded', () => {
    console.log('LitRev Dashboard Initialized');

    // Add simple interaction for the search bar
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

    // Sidebar Toggle Logic
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.querySelector('.sidebar-toggle');

    if (sidebar && sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');

            // Optional: Adjust icon based on state if needed, but CSS rotation handles it
        });
    }

    // Sort Dropdown Logic
    const sortBtn = document.getElementById('sortBtn');
    const sortOptions = document.getElementById('sortOptions');
    const options = document.querySelectorAll('.option');

    if (sortBtn && sortOptions) {
        sortBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sortOptions.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!sortBtn.contains(e.target) && !sortOptions.contains(e.target)) {
                sortOptions.classList.remove('show');
            }
        });

        options.forEach(option => {
            option.addEventListener('click', () => {
                // Remove selected class from all
                options.forEach(opt => opt.classList.remove('selected'));
                // Add to clicked
                option.classList.add('selected');
                // Close dropdown
                sortOptions.classList.remove('show');
                // Optional: Update button text or trigger sort
                console.log('Sorting by:', option.dataset.value);
            });
        });
    }

    // View Toggle Logic
    const gridViewBtn = document.getElementById('gridViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');
    const projectGrid = document.querySelector('.project-grid');

    if (gridViewBtn && listViewBtn && projectGrid) {
        gridViewBtn.addEventListener('click', () => {
            projectGrid.classList.remove('list-view');
            gridViewBtn.classList.add('active');
            listViewBtn.classList.remove('active');
        });

        listViewBtn.addEventListener('click', () => {
            projectGrid.classList.add('list-view');
            listViewBtn.classList.add('active');
            gridViewBtn.classList.remove('active');
        });
    }
});
