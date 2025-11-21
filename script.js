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

    // Add hover effects for cards (JS fallback or enhancement)
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            // Optional: Add more complex JS animations here if CSS isn't enough
        });
    });
});
