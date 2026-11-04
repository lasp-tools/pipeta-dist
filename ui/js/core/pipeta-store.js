// --- PIPETA REACTIVE STORE & EVENT BUS (v2.0) ---
(function () {
    const _listeners = new Map();

    const PipetaEvents = {
        on(evt, fn) {
            if (!evt || typeof fn !== 'function') return () => {};
            if (!_listeners.has(evt)) _listeners.set(evt, new Set());
            _listeners.get(evt).add(fn);
            return () => PipetaEvents.off(evt, fn);
        },
        off(evt, fn) {
            if (!evt) return;
            const set = _listeners.get(evt);
            if (!set) return;
            if (fn) {
                set.delete(fn);
                if (set.size === 0) _listeners.delete(evt);
            } else {
                _listeners.delete(evt);
            }
        },
        emit(evt, payload) {
            const set = _listeners.get(evt);
            if (!set || set.size === 0) return;
            for (const fn of Array.from(set)) {
                try {
                    fn(payload);
                } catch (err) {
                    console.error(`[PipetaEvents] Error in listener for "${evt}":`, err);
                }
            }
        }
    };

    const INITIAL_STATE = {
        viewLocationMode: 'local',
        syncComparisonMode: 'drive',
        pipetaUseFilter: false,
        explorerOnlyMyTasks: false,
        explorerSearchQuery: '',
        zEnvOverride: 'auto',
        deepCompareMode: false
    };

    const _state = Object.assign({}, INITIAL_STATE);

    const PipetaStore = {
        get(key) {
            return _state[key];
        },
        set(key, value) {
            const prevValue = _state[key];
            _state[key] = value;
            if (prevValue !== value) {
                const payload = { key, value, prevValue };
                PipetaEvents.emit(`state:${key}`, value, payload);
                PipetaEvents.emit('state:change', payload);
            }
            return value;
        },
        getState() {
            return Object.assign({}, _state);
        },
        subscribe(key, fn) {
            return PipetaEvents.on(`state:${key}`, fn);
        }
    };

    // Bridge reactive keys onto window.* so all existing UI modules work seamlessly
    Object.keys(INITIAL_STATE).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(window, key) && window[key] !== undefined) {
            _state[key] = window[key];
        }
        Object.defineProperty(window, key, {
            get() {
                return PipetaStore.get(key);
            },
            set(val) {
                PipetaStore.set(key, val);
            },
            configurable: true,
            enumerable: true
        });
    });

    window.PipetaEvents = PipetaEvents;
    window.PipetaStore = PipetaStore;
})();
