/* AimScope shared namespace and extension hooks. */
(function(window) {
  const AimScope = window.AimScope = window.AimScope || {};
  AimScope.version = AimScope.version || '2.4';
  AimScope.modules = AimScope.modules || {};
  AimScope.hooks = AimScope.hooks || {
    topicFormatters: new Map(),
    logSinks: [],
    panels: new Map(),
  };
  AimScope.registerTopicFormatter = function(topicName, formatter) {
    if (typeof formatter === 'function') AimScope.hooks.topicFormatters.set(topicName, formatter);
  };
  AimScope.registerLogSink = function(sink) {
    if (typeof sink === 'function') AimScope.hooks.logSinks.push(sink);
  };
  AimScope.emitLog = function(entry) {
    AimScope.hooks.logSinks.forEach(sink => {
      try { sink(entry); } catch (err) { console.warn('AimScope log sink failed', err); }
    });
  };
  AimScope.registerPanel = function(name, factory) {
    if (name && typeof factory === 'function') AimScope.hooks.panels.set(name, factory);
  };
})(window);