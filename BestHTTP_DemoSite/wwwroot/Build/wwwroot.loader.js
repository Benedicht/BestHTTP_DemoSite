function createUnityInstance(canvas, config, onProgress) {
  onProgress = onProgress || function () {};


  function showBanner(msg, type) {
    // Only ever show one error at most - other banner messages after that should get ignored
    // to avoid noise.
    if (!showBanner.aborted && config.showBanner) {
      if (type == 'error') showBanner.aborted = true;
      return config.showBanner(msg, type);
    }

    // Fallback to console logging if visible banners have been suppressed
    // from the main page.
    switch(type) {
      case 'error': console.error(msg); break;
      case 'warning': console.warn(msg); break;
      default: console.log(msg); break;
    }
  }

  function errorListener(e) {
    var error = e.reason || e.error;
    var message = error ? error.toString() : (e.message || e.reason || '');
    var stack = (error && error.stack) ? error.stack.toString() : '';

    // Do not repeat the error message if it's present in the stack trace.
    if (stack.startsWith(message)) {
      stack = stack.substring(message.length);
    }

    message += '\n' + stack.trim();

    if (!message || !Module.stackTraceRegExp || !Module.stackTraceRegExp.test(message))
      return;

    var filename = e.filename || (error && (error.fileName || error.sourceURL)) || '';
    var lineno = e.lineno || (error && (error.lineNumber || error.line)) || 0;

    errorHandler(message, filename, lineno);
  }

  var Module = {
    canvas: canvas,
    webglContextAttributes: {
      preserveDrawingBuffer: false,
    },
    streamingAssetsUrl: "StreamingAssets",
    downloadProgress: {},
    deinitializers: [],
    intervals: {},
    setInterval: function (func, ms) {
      var id = window.setInterval(func, ms);
      this.intervals[id] = true;
      return id;
    },
    clearInterval: function(id) {
      delete this.intervals[id];
      window.clearInterval(id);
    },
    preRun: [],
    postRun: [],
    print: function (message) {
      console.log(message);
    },
    printErr: function (message) {
      console.error(message);

      if (typeof message === 'string' && message.indexOf('wasm streaming compile failed') != -1) {
        if (message.toLowerCase().indexOf('mime') != -1) {
          showBanner('HTTP Response Header "Content-Type" configured incorrectly on the server for file ' + Module.codeUrl + ' , should be "application/wasm". Startup time performance will suffer.', 'warning');
        } else {
          showBanner('WebAssembly streaming compilation failed! This can happen for example if "Content-Encoding" HTTP header is incorrectly enabled on the server for file ' + Module.codeUrl + ', but the file is not pre-compressed on disk (or vice versa). Check the Network tab in browser Devtools to debug server header configuration.', 'warning');
        }
      }
    },
    locateFile: function (url) {
      return (
        url == "build.wasm" ? this.codeUrl :
        url
      );
    },
    disabledCanvasEvents: [
      "contextmenu",
      "dragstart",
    ],
  };

  for (var parameter in config)
    Module[parameter] = config[parameter];

  Module.streamingAssetsUrl = new URL(Module.streamingAssetsUrl, document.URL).href;

  // Operate on a clone of Module.disabledCanvasEvents field so that at Quit time
  // we will ensure we'll remove the events that we created (in case user has
  // modified/cleared Module.disabledCanvasEvents in between)
  var disabledCanvasEvents = Module.disabledCanvasEvents.slice();

  function preventDefault(e) {
    e.preventDefault();
  }

  disabledCanvasEvents.forEach(function (disabledCanvasEvent) {
    canvas.addEventListener(disabledCanvasEvent, preventDefault);
  });

  window.addEventListener("error", errorListener);
  window.addEventListener("unhandledrejection", errorListener);

  var unityInstance = {
    Module: Module,
    SetFullscreen: function () {
      if (Module.SetFullscreen)
        return Module.SetFullscreen.apply(Module, arguments);
      Module.print("Failed to set Fullscreen mode: Player not loaded yet.");
    },
    SendMessage: function () {
      if (Module.SendMessage)
        return Module.SendMessage.apply(Module, arguments);
      Module.print("Failed to execute SendMessage: Player not loaded yet.");
    },
    Quit: function () {
      return new Promise(function (resolve, reject) {
        Module.shouldQuit = true;
        Module.onQuit = resolve;

        // Clear the event handlers we added above, so that the event handler
        // functions will not hold references to this JS function scope after
        // exit, to allow JS garbage collection to take place.
        disabledCanvasEvents.forEach(function (disabledCanvasEvent) {
          canvas.removeEventListener(disabledCanvasEvent, preventDefault);
        });
        window.removeEventListener("error", errorListener);
        window.removeEventListener("unhandledrejection", errorListener);
      });
    },
  };

  Module.SystemInfo = (function () {

    var browser, browserVersion, os, osVersion, canvas, gpu;

    var ua = navigator.userAgent + ' ';
    var browsers = [
      ['Firefox', 'Firefox'],
      ['OPR', 'Opera'],
      ['Edg', 'Edge'],
      ['SamsungBrowser', 'Samsung Browser'],
      ['Trident', 'Internet Explorer'],
      ['MSIE', 'Internet Explorer'],
      ['Chrome', 'Chrome'],
      ['CriOS', 'Chrome on iOS Safari'],
      ['FxiOS', 'Firefox on iOS Safari'],
      ['Safari', 'Safari'],
    ];

    function extractRe(re, str, idx) {
      re = RegExp(re, 'i').exec(str);
      return re && re[idx];
    }
    for(var b = 0; b < browsers.length; ++b) {
      browserVersion = extractRe(browsers[b][0] + '[\/ ](.*?)[ \\)]', ua, 1);
      if (browserVersion) {
        browser = browsers[b][1];
        break;
      }
    }
    if (browser == 'Safari') browserVersion = extractRe('Version\/(.*?) ', ua, 1);
    if (browser == 'Internet Explorer') browserVersion = extractRe('rv:(.*?)\\)? ', ua, 1) || browserVersion;

    var oses = [
      ['Windows (.*?)[;\)]', 'Windows'],
      ['Android ([0-9_\.]+)', 'Android'],
      ['iPhone OS ([0-9_\.]+)', 'iPhoneOS'],
      ['iPad.*? OS ([0-9_\.]+)', 'iPadOS'],
      ['FreeBSD( )', 'FreeBSD'],
      ['OpenBSD( )', 'OpenBSD'],
      ['Linux|X11()', 'Linux'],
      ['Mac OS X ([0-9_\.]+)', 'macOS'],
      ['bot|google|baidu|bing|msn|teoma|slurp|yandex', 'Search Bot']
    ];
    for(var o = 0; o < oses.length; ++o) {
      osVersion = extractRe(oses[o][0], ua, 1);
      if (osVersion) {
        os = oses[o][1];
        osVersion = osVersion.replace(/_/g, '.');
        break;
      }
    }
    var versionMappings = {
      'NT 5.0': '2000',
      'NT 5.1': 'XP',
      'NT 5.2': 'Server 2003',
      'NT 6.0': 'Vista',
      'NT 6.1': '7',
      'NT 6.2': '8',
      'NT 6.3': '8.1',
      'NT 10.0': '10'
    };
    osVersion = versionMappings[osVersion] || osVersion;

    // TODO: Add mobile device identifier, e.g. SM-G960U

    canvas = document.createElement("canvas");
    if (canvas) {
      gl = canvas.getContext("webgl2");
      glVersion = gl ? 2 : 0;
      if (!gl) {
        if (gl = canvas && canvas.getContext("webgl")) glVersion = 1;
      }

      if (gl) {
        gpu = (gl.getExtension("WEBGL_debug_renderer_info") && gl.getParameter(0x9246 /*debugRendererInfo.UNMASKED_RENDERER_WEBGL*/)) || gl.getParameter(0x1F01 /*gl.RENDERER*/);
      }
    }

    var hasThreads = typeof SharedArrayBuffer !== 'undefined';
    var hasWasm = typeof WebAssembly === "object" && typeof WebAssembly.compile === "function";
    return {
      width: screen.width,
      height: screen.height,
      userAgent: ua.trim(),
      browser: browser || 'Unknown browser',
      browserVersion: browserVersion || 'Unknown version',
      mobile: /Mobile|Android|iP(ad|hone)/.test(navigator.appVersion),
      os: os || 'Unknown OS',
      osVersion: osVersion || 'Unknown OS Version',
      gpu: gpu || 'Unknown GPU',
      language: navigator.userLanguage || navigator.language,
      hasWebGL: glVersion,
      hasCursorLock: !!document.body.requestPointerLock,
      hasFullscreen: !!document.body.requestFullscreen || !!document.body.webkitRequestFullscreen, // Safari still uses the webkit prefixed version
      hasThreads: hasThreads,
      hasWasm: hasWasm,
      // This should be updated when we re-enable wasm threads. Previously it checked for WASM thread
      // support with: var wasmMemory = hasWasm && hasThreads && new WebAssembly.Memory({"initial": 1, "maximum": 1, "shared": true});
      // which caused Chrome to have a warning that SharedArrayBuffer requires cross origin isolation.
      hasWasmThreads: false,
    };
  })();

  function errorHandler(message, filename, lineno) {
    // Unity needs to rely on Emscripten deferred fullscreen requests, so these will make their way to error handler
    if (message.indexOf('fullscreen error') != -1)
      return;

    if (Module.startupErrorHandler) {
      Module.startupErrorHandler(message, filename, lineno);
      return;
    }
    if (Module.errorHandler && Module.errorHandler(message, filename, lineno))
      return;
    console.log("Invoking error handler due to\n" + message);

    // Support Firefox window.dump functionality.
    if (typeof dump == "function")
      dump("Invoking error handler due to\n" + message);

    if (errorHandler.didShowErrorMessage)
      return;
    var message = "An error occurred running the Unity content on this page. See your browser JavaScript console for more info. The error was:\n" + message;
    if (message.indexOf("DISABLE_EXCEPTION_CATCHING") != -1) {
      message = "An exception has occurred, but exception handling has been disabled in this build. If you are the developer of this content, enable exceptions in your project WebGL player settings to be able to catch the exception or see the stack trace.";
    } else if (message.indexOf("Cannot enlarge memory arrays") != -1) {
      message = "Out of memory. If you are the developer of this content, try allocating more memory to your WebGL build in the WebGL player settings.";
    } else if (message.indexOf("Invalid array buffer length") != -1  || message.indexOf("Invalid typed array length") != -1 || message.indexOf("out of memory") != -1 || message.indexOf("could not allocate memory") != -1) {
      message = "The browser could not allocate enough memory for the WebGL content. If you are the developer of this content, try allocating less memory to your WebGL build in the WebGL player settings.";
    }
    alert(message);
    errorHandler.didShowErrorMessage = true;
  }


  Module.abortHandler = function (message) {
    errorHandler(message, "", 0);
    return true;
  };

  Error.stackTraceLimit = Math.max(Error.stackTraceLimit || 0, 50);

  function progressUpdate(id, e) {
    if (id == "symbolsUrl")
      return;
    var progress = Module.downloadProgress[id];
    if (!progress)
      progress = Module.downloadProgress[id] = {
        started: false,
        finished: false,
        lengthComputable: false,
        total: 0,
        loaded: 0,
      };
    if (typeof e == "object" && (e.type == "progress" || e.type == "load")) {
      if (!progress.started) {
        progress.started = true;
        progress.lengthComputable = e.lengthComputable;
        progress.total = e.total;
      }
      progress.loaded = e.loaded;
      if (e.type == "load")
        progress.finished = true;
    }
    var loaded = 0, total = 0, started = 0, computable = 0, unfinishedNonComputable = 0;
    for (var id in Module.downloadProgress) {
      var progress = Module.downloadProgress[id];
      if (!progress.started)
        return 0;
      started++;
      if (progress.lengthComputable) {
        loaded += progress.loaded;
        total += progress.total;
        computable++;
      } else if (!progress.finished) {
        unfinishedNonComputable++;
      }
    }
    var totalProgress = started ? (started - unfinishedNonComputable - (total ? computable * (total - loaded) / total : 0)) / started : 0;
    onProgress(0.9 * totalProgress);
  }



  function downloadBinary(urlId) {
    return new Promise(function (resolve, reject) {
      progressUpdate(urlId);
      var xhr = new XMLHttpRequest();
      xhr.open("GET", Module[urlId]);
      xhr.responseType = "arraybuffer";
      xhr.addEventListener("progress", function (e) {
        progressUpdate(urlId, e);
      });
      xhr.addEventListener("load", function(e) {
        progressUpdate(urlId, e);
        resolve(new Uint8Array(xhr.response));
      });

      xhr.addEventListener("error", function(e) {
        var error = 'Failed to download file ' + Module[urlId]
        if (location.protocol == 'file:') {
          showBanner(error + '. Loading web pages via a file:// URL without a web server is not supported by this browser. Please use a local development web server to host Unity content, or use the Unity Build and Run option.', 'error');
        } else {
          console.error(error);
        }
      });

      xhr.send();
    });
  }

  function downloadFramework() {
      return new Promise(function (resolve, reject) {
        var script = document.createElement("script");
        script.src = Module.frameworkUrl;
        script.onload = function () {
          // Adding the framework.js script to DOM created a global
          // 'unityFramework' variable that should be considered internal.
          // If not, then we have received a malformed file.
          if (typeof unityFramework === 'undefined' || !unityFramework) {
            var compressions = [['br', 'br'], ['gz', 'gzip']];
            for(var i in compressions) {
              var compression = compressions[i];
              if (Module.frameworkUrl.endsWith('.' + compression[0])) {
                var error = 'Unable to parse ' + Module.frameworkUrl + '!';
                if (location.protocol == 'file:') {
                  showBanner(error + ' Loading pre-compressed (brotli or gzip) content via a file:// URL without a web server is not supported by this browser. Please use a local development web server to host compressed Unity content, or use the Unity Build and Run option.', 'error');
                  return;
                }
                error += ' This can happen if build compression was enabled but web server hosting the content was misconfigured to not serve the file with HTTP Response Header "Content-Encoding: ' + compression[1] + '" present. Check browser Console and Devtools Network tab to debug.';
                if (compression[0] == 'br') {
                  if (location.protocol == 'http:') {
                    var migrationHelp = ['localhost', '127.0.0.1'].indexOf(location.hostname) != -1 ? '' : 'Migrate your server to use HTTPS.'
                    if (/Firefox/.test(navigator.userAgent)) error = 'Unable to parse ' + Module.frameworkUrl + '!<br>If using custom web server, verify that web server is sending .br files with HTTP Response Header "Content-Encoding: br". Brotli compression may not be supported in Firefox over HTTP connections. ' + migrationHelp + ' See <a href="https://bugzilla.mozilla.org/show_bug.cgi?id=1670675">https://bugzilla.mozilla.org/show_bug.cgi?id=1670675</a> for more information.';
                    else error = 'Unable to parse ' + Module.frameworkUrl + '!<br>If using custom web server, verify that web server is sending .br files with HTTP Response Header "Content-Encoding: br". Brotli compression may not be supported over HTTP connections. Migrate your server to use HTTPS.';
                  }
                }
                showBanner(error, 'error');
                return;
              }
            };
            showBanner('Unable to parse ' + Module.frameworkUrl + '! The file is corrupt, or compression was misconfigured? (check Content-Encoding HTTP Response Header on web server)', 'error');
          }

          // Capture the variable to local scope and clear it from global
          // scope so that JS garbage collection can take place on
          // application quit.
          var fw = unityFramework;
          unityFramework = null;
          // Also ensure this function will not hold any JS scope
          // references to prevent JS garbage collection.
          script.onload = null;
          resolve(fw);
        }
        script.onerror = function(e) {
          showBanner('Unable to load file ' + Module.frameworkUrl + '! Check that the file exists on the remote server. (also check browser Console and Devtools Network tab to debug)', 'error');
        }
        document.body.appendChild(script);
        Module.deinitializers.push(function() {
          document.body.removeChild(script);
        });
      });
  }

  function loadBuild() {
    downloadFramework().then(function (unityFramework) {
      unityFramework(Module);
    });

    var dataPromise = downloadBinary("dataUrl");
    Module.preRun.push(function () {
      Module.addRunDependency("dataUrl");
      dataPromise.then(function (data) {
        var view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        var pos = 0;
        var prefix = "UnityWebData1.0\0";
        if (!String.fromCharCode.apply(null, data.subarray(pos, pos + prefix.length)) == prefix)
          throw "unknown data format";
        pos += prefix.length;
        var headerSize = view.getUint32(pos, true); pos += 4;
        while (pos < headerSize) {
          var offset = view.getUint32(pos, true); pos += 4;
          var size = view.getUint32(pos, true); pos += 4;
          var pathLength = view.getUint32(pos, true); pos += 4;
          var path = String.fromCharCode.apply(null, data.subarray(pos, pos + pathLength)); pos += pathLength;
          for (var folder = 0, folderNext = path.indexOf("/", folder) + 1 ; folderNext > 0; folder = folderNext, folderNext = path.indexOf("/", folder) + 1)
            Module.FS_createPath(path.substring(0, folder), path.substring(folder, folderNext - 1), true, true);
          Module.FS_createDataFile(path, null, data.subarray(offset, offset + size), true, true, true);
        }
        Module.removeRunDependency("dataUrl");
      });
    });
  }

  return new Promise(function (resolve, reject) {
    if (!Module.SystemInfo.hasWebGL) {
      reject("Your browser does not support WebGL.");
    } else if (!Module.SystemInfo.hasWasm) {
      reject("Your browser does not support WebAssembly.");
    } else {
      if (Module.SystemInfo.hasWebGL == 1)
        Module.print("Warning: Your browser does not support \"WebGL 2\" Graphics API, switching to \"WebGL 1\"");
      Module.startupErrorHandler = reject;
      onProgress(0);
      Module.postRun.push(function () {
        onProgress(1);
        delete Module.startupErrorHandler;
        resolve(unityInstance);
      });
      loadBuild();
    }
  });
}
