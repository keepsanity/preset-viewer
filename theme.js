/* 색상 테마 전환기.
   모든 팔레트가 --pv-h(색상) / --pv-s(채도) 에서 파생되므로
   테마 하나 = 숫자 두 개입니다. theme.css 참고. */
(function () {
    'use strict';

    var THEMES = [
        { id: 'pink', label: '핑크', h: 330, s: 1 },
        { id: 'peach', label: '피치', h: 18, s: 1 },
        { id: 'lemon', label: '레몬', h: 45, s: 1 },
        { id: 'mint', label: '민트', h: 160, s: 1 },
        { id: 'sky', label: '스카이', h: 200, s: 1 },
        { id: 'blueberry', label: '블루베리', h: 255, s: 1 },
        { id: 'lavender', label: '라벤더', h: 290, s: 1 },
        { id: 'mono', label: '모노', h: 320, s: 0.08 }
    ];

    var STORAGE_KEY = 'pv-color-theme';
    var DEFAULT_ID = 'pink';

    function byId(id) {
        for (var i = 0; i < THEMES.length; i++) {
            if (THEMES[i].id === id) return THEMES[i];
        }
        return null;
    }

    function readSaved() {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return null;
        }
    }

    function save(id) {
        try {
            localStorage.setItem(STORAGE_KEY, id);
        } catch (e) { /* 사생활 보호 모드 등 - 무시 */ }
    }

    function apply(theme) {
        var root = document.documentElement;
        root.style.setProperty('--pv-h', String(theme.h));
        root.style.setProperty('--pv-s', String(theme.s));
        root.setAttribute('data-theme', theme.id);
    }

    function swatchGradient(theme) {
        var light = 'hsl(' + theme.h + ', ' + (100 * theme.s) + '%, 85%)';
        var deep = 'hsl(' + theme.h + ', ' + (66 * theme.s) + '%, 52%)';
        return 'linear-gradient(135deg, ' + light + ' 0%, ' + deep + ' 100%)';
    }

    var current = byId(readSaved()) || byId(DEFAULT_ID);
    apply(current);

    function mount() {
        var header = document.querySelector('.header');
        if (!header || header.querySelector('.theme-switcher')) return;

        var wrap = document.createElement('div');
        wrap.className = 'theme-switcher';

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'theme-toggle';
        toggle.title = '색상 테마';
        toggle.setAttribute('aria-label', '색상 테마 바꾸기');
        toggle.textContent = '🎨';

        var panel = document.createElement('div');
        panel.className = 'theme-panel';

        var title = document.createElement('div');
        title.className = 'theme-panel-title';
        title.textContent = '색상 테마';
        panel.appendChild(title);

        var list = document.createElement('div');
        list.className = 'theme-list';

        var options = THEMES.map(function (theme) {
            var option = document.createElement('button');
            option.type = 'button';
            option.className = 'theme-option' + (theme.id === current.id ? ' active' : '');
            option.title = theme.label;

            var swatch = document.createElement('span');
            swatch.className = 'theme-swatch';
            swatch.style.background = swatchGradient(theme);

            var label = document.createElement('span');
            label.className = 'theme-option-label';
            label.textContent = theme.label;

            option.appendChild(swatch);
            option.appendChild(label);
            option.addEventListener('click', function () {
                current = theme;
                apply(theme);
                save(theme.id);
                options.forEach(function (other) {
                    other.classList.toggle('active', other === option);
                });
                panel.classList.remove('open');
            });

            list.appendChild(option);
            return option;
        });

        panel.appendChild(list);
        wrap.appendChild(toggle);
        wrap.appendChild(panel);
        header.appendChild(wrap);

        toggle.addEventListener('click', function (e) {
            e.stopPropagation();
            panel.classList.toggle('open');
        });

        panel.addEventListener('click', function (e) {
            e.stopPropagation();
        });

        document.addEventListener('click', function () {
            panel.classList.remove('open');
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') panel.classList.remove('open');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();
