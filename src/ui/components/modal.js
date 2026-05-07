// src/ui/components/modal.js
window.App = window.App || {};
App.ui = App.ui || {};

/**
 * Создаёт модальное окно:
 * - на десктопе (ширина >= 768px) – центрированное окно,
 * - на мобильных – выезжающая снизу панель (bottom sheet).
 * @param {string} title - Заголовок окна
 * @param {string} content - HTML-содержимое
 * @returns {HTMLElement} DOM-элемент модалки
 */
App.ui.createModal = function(title, content) {
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';

    var innerHtml =
        '<div class="modal-content">' +
            '<span class="close">&times;</span>' +
            '<h3>' + App.utils.escapeHtml(title) + '</h3>' +
            content +
        '</div>';

    // На узких экранах добавляем обёртку для bottom sheet
    if (window.innerWidth < 768) {
        innerHtml = '<div class="modal-bottom-sheet">' + innerHtml + '</div>';
    }

    modal.innerHTML = innerHtml;
    document.body.appendChild(modal);

    // Закрытие по крестику
    var closeBtn = modal.querySelector('.close');
    if (closeBtn) {
        closeBtn.onclick = function() {
            modal.remove();
        };
    }

    // Закрытие по клику вне окна
    modal.onclick = function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    };

    App.initIcons();
    return modal;
};