(function () {
  "use strict";

  var THUMBS = {
    note: "assets/note.png",
    photo: "assets/photo.png",
    song: "assets/song.png",
    video: "assets/video.png",
    gift: "assets/gift.png",
    voice: "assets/voice.png",
    drawing: "assets/drawing.png",
    map: "assets/map.png",
    coupon: "assets/coupon.png",
    news: "assets/news.png"
  };
  var LABELS = {
    note: "Note",
    photo: "Photo",
    song: "Song",
    video: "Video",
    gift: "Gift",
    voice: "Voice",
    drawing: "Drawing",
    map: "Location",
    coupon: "Coupon",
    news: "News"
  };
  var DRAW_COLORS = ["#1a1a1a", "#8A6A4A", "#A9483F", "#c96a8e", "#7a9e62", "#ffffff"];
  var MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB

  var state = { theme: "custom", title: "", message: "", from: "", anonymous: false, items: [] };

  function getAssetPath(filename) {
    if (window.location.pathname.includes('/recreation/')) {
      return filename.replace('assets/', 'assets/');
    }
    return filename;
  }

  // ---------- DOM Helper ----------
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function resizeImageToDataUrl(file, maxW, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, maxW / img.width);
          var canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", quality || 0.8));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function formatAudioTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var s = Math.floor(sec);
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function createVoicePlayer(src) {
    var wrap = el("div", { class: "voice-player" });
    var audio = el("audio", { preload: "metadata" });
    if (src) audio.src = src;
    var playBtn = el("button", { type: "button", class: "voice-player__play", "aria-label": "Play" });
    playBtn.textContent = "▶";
    var seek = el("input", {
      type: "range",
      class: "voice-player__seek",
      min: "0",
      max: "0",
      value: "0",
      step: "0.01"
    });
    var time = el("span", { class: "voice-player__time", text: "0:00" });
    wrap.appendChild(playBtn);
    wrap.appendChild(seek);
    wrap.appendChild(time);
    wrap.appendChild(audio);

    var scrubbing = false;

    function syncTime() {
      time.textContent = formatAudioTime(audio.currentTime) + " / " + formatAudioTime(audio.duration || 0);
      if (!scrubbing && isFinite(audio.duration) && audio.duration > 0) {
        seek.max = String(audio.duration);
        seek.value = String(audio.currentTime);
      }
    }

    playBtn.addEventListener("click", function () {
      if (audio.paused) audio.play();
      else audio.pause();
    });
    audio.addEventListener("play", function () { playBtn.textContent = "❚❚"; });
    audio.addEventListener("pause", function () { playBtn.textContent = "▶"; });
    audio.addEventListener("ended", function () { playBtn.textContent = "▶"; });
    audio.addEventListener("timeupdate", syncTime);
    audio.addEventListener("loadedmetadata", syncTime);
    seek.addEventListener("pointerdown", function () { scrubbing = true; });
    seek.addEventListener("pointerup", function () { scrubbing = false; });
    seek.addEventListener("input", function () {
      var v = Number(seek.value);
      if (isFinite(v)) audio.currentTime = v;
      time.textContent = formatAudioTime(audio.currentTime) + " / " + formatAudioTime(audio.duration || 0);
    });

    return {
      root: wrap,
      audio: audio,
      setSrc: function (url) {
        audio.src = url || "";
        audio.load();
        playBtn.textContent = "▶";
        seek.value = "0";
        syncTime();
      }
    };
  }

  // ---------- Builder: Type Chooser & Form ----------
  function markerCircle() {
    return el("span", { class: "marker-circle", "aria-hidden": "true" });
  }

  function renderTypeGrid() {
    var grid = document.getElementById("typeGrid");
    if (!grid) return;
    grid.innerHTML = "";
    Object.keys(THUMBS).forEach(function (type) {
      var icon = el("div", { class: "type-icon" }, [
        markerCircle(),
        el("img", { src: getAssetPath(THUMBS[type]), alt: LABELS[type] })
      ]);
      var btn = el("button", { class: "type-btn", type: "button", onclick: function () { showItemForm(type); } }, [
        icon,
        el("span", { text: "+ " + LABELS[type] })
      ]);
      grid.appendChild(btn);
    });
  }

  function showItemForm(type) {
    var host = document.getElementById("itemFormHost");
    var backdrop = document.getElementById("itemFormBackdrop");
    var titleEl = document.getElementById("itemFormTitle");
    host.innerHTML = "";
    titleEl.textContent = ("ADD " + (LABELS[type] || type)).toUpperCase();
    var form = el("div", { class: "item-form" });

    function closeForm() {
      if (form._teardown) {
        try { form._teardown(); } catch (err) {}
        form._teardown = null;
      }
      host.innerHTML = "";
      backdrop.hidden = true;
      backdrop.classList.remove("visible");
      document.body.classList.remove("modal-open");
    }

    function addField(labelText, inputEl) {
      form.appendChild(el("label", { class: "field-label", text: labelText }));
      form.appendChild(inputEl);
    }

    var draft = { type: type };

    if (type === "note") {
      var ta = el("textarea", { placeholder: "write something..." });
      addField("Note", ta);
      form._collect = function () {
        draft.text = ta.value.trim();
        return draft.text ? draft : null;
      };
    }

    if (type === "photo") {
      var file = el("input", { type: "file", accept: "image/*" });
      var preview = el("img", { class: "photo-preview", alt: "Photo preview" });
      preview.hidden = true;
      var previewUrl = "";
      var photoHint = el("div", { class: "upload-status", text: "Max file size: 5MB" });
      var cap = el("input", { type: "text", placeholder: "caption (optional)" });
      addField("Photo", file);
      form.appendChild(photoHint);
      form.appendChild(preview);
      addField("Caption", cap);

      function clearPhotoPreview() {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          previewUrl = "";
        }
        preview.hidden = true;
        preview.removeAttribute("src");
      }

      file.addEventListener("change", function () {
        clearPhotoPreview();
        photoHint.textContent = "Max file size: 5MB";
        photoHint.classList.remove("is-error");
        if (!file.files || !file.files[0]) return;
        if (file.files[0].size > MAX_PHOTO_BYTES) {
          file.value = "";
          photoHint.textContent = "That photo is too large — please choose one under 5MB.";
          photoHint.classList.add("is-error");
          return;
        }
        previewUrl = URL.createObjectURL(file.files[0]);
        preview.src = previewUrl;
        preview.hidden = false;
      });

      form._teardown = function () { clearPhotoPreview(); };

      form._collect = function () {
        if (!file.files || !file.files[0]) return null;
        if (file.files[0].size > MAX_PHOTO_BYTES) {
          throw new Error("Photo must be under 5MB");
        }
        return resizeImageToDataUrl(file.files[0], 640, 0.8).then(function (dataUrl) {
          draft.fileUrl = dataUrl;
          draft.caption = cap.value.trim();
          return draft;
        });
      };
    }

    if (type === "song") {
      var url1 = el("input", { type: "url", placeholder: "https://open.spotify.com/track/..." });
      var titleInput = el("input", { type: "text", placeholder: "song title (optional)" });
      addField("Song link (Spotify, Apple Music, YouTube Music...)", url1);
      addField("Title", titleInput);
      form._collect = function () {
        draft.url = url1.value.trim();
        draft.title = titleInput.value.trim();
        return draft.url ? draft : null;
      };
    }

    if (type === "video") {
      var fileInput = el("input", { type: "file", accept: "video/*" });
      var videoPreview = el("video", { class: "video-preview", controls: true });
      videoPreview.style.display = "none";
      var statusHint = el("div", { class: "upload-status", text: "Upload a video file OR paste a link below" });
      var url2 = el("input", { type: "url", placeholder: "https://youtube.com/watch?v=... or direct MP4 link" });
      var cap2 = el("input", { type: "text", placeholder: "caption (optional)" });

      addField("Video file", fileInput);
      form.appendChild(statusHint);
      form.appendChild(videoPreview);
      addField("OR Video link (YouTube, Vimeo, MP4...)", url2);
      addField("Caption", cap2);

      fileInput.addEventListener("change", function () {
        if (!fileInput.files || !fileInput.files[0]) return;
        var file = fileInput.files[0];
        videoPreview.src = URL.createObjectURL(file);
        videoPreview.style.display = "block";
      });

      form._collect = function () {
        if (fileInput.files && fileInput.files[0]) {
          return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
              draft.fileUrl = reader.result;
              draft.caption = cap2.value.trim();
              resolve(draft);
            };
            reader.onerror = reject;
            reader.readAsDataURL(fileInput.files[0]);
          });
        }
        draft.url = url2.value.trim();
        draft.caption = cap2.value.trim();
        return (draft.url || draft.fileUrl) ? draft : null;
      };
    }

    if (type === "gift") {
      var url3 = el("input", { type: "url", placeholder: "https://..." });
      var note3 = el("textarea", { placeholder: "a note to go with it (optional)" });
      addField("Gift card / e-gift link", url3);
      addField("Note", note3);
      form._collect = function () {
        draft.url = url3.value.trim();
        draft.note = note3.value.trim();
        return draft.url ? draft : null;
      };
    }

    if (type === "map") {
      var placeName = el("input", { type: "text", placeholder: "our coffee shop / the park / home" });
      var mapUrl = el("input", { type: "url", placeholder: "https://maps.google.com/..." });
      var mapNote = el("textarea", { placeholder: "why this place matters (optional)" });
      addField("Place name", placeName);
      addField("Map link (Google Maps, Apple Maps...)", mapUrl);
      addField("Note", mapNote);
      form._collect = function () {
        draft.title = placeName.value.trim();
        draft.url = mapUrl.value.trim();
        draft.note = mapNote.value.trim();
        return (draft.title && draft.url) ? draft : null;
      };
    }

    if (type === "coupon") {
      var couponFor = el("input", { type: "text", placeholder: "one movie night / one free hug / one vent call" });
      var couponNote = el("textarea", { placeholder: "fine print or a little note (optional)" });
      addField("This coupon is good for", couponFor);
      addField("Note", couponNote);
      form._collect = function () {
        draft.title = couponFor.value.trim();
        draft.note = couponNote.value.trim();
        return draft.title ? draft : null;
      };
    }

    if (type === "news") {
      var newsUrl = el("input", { type: "url", placeholder: "https://..." });
      var newsTitle = el("input", { type: "text", placeholder: "article title (optional)" });
      var newsNote = el("textarea", { placeholder: "why you're sending this (optional)" });
      addField("Article link", newsUrl);
      addField("Headline", newsTitle);
      addField("Note", newsNote);
      form._collect = function () {
        draft.url = newsUrl.value.trim();
        draft.title = newsTitle.value.trim();
        draft.note = newsNote.value.trim();
        return draft.url ? draft : null;
      };
    }

    if (type === "voice") {
      var voiceUI = el("div", { class: "voice-recorder" });
      var status = el("div", { class: "upload-status", text: "Record a voice note using your microphone" });
      var recBtn = el("button", { type: "button", class: "voice-recorder__btn", text: "Record" });
      var actions = el("div", { class: "voice-recorder__actions" }, [recBtn]);
      var memoPlayer = createVoicePlayer();
      memoPlayer.root.classList.add("voice-recorder__player");
      voiceUI.appendChild(actions);
      voiceUI.appendChild(status);
      voiceUI.appendChild(memoPlayer.root);

      var mediaRecorder = null, chunks = [], recording = false, activeStream = null;

      recBtn.addEventListener("click", function () {
        if (!recording) {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            status.textContent = "Voice recording isn't supported in this browser.";
            return;
          }
          navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
            chunks = [];
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = function (e) { chunks.push(e.data); };
            mediaRecorder.onstop = function () {
              var blob = new Blob(chunks, { type: "audio/webm" });
              var reader = new FileReader();
              reader.onload = function () {
                draft.fileUrl = reader.result;
                memoPlayer.setSrc(reader.result);
                memoPlayer.root.classList.add("is-visible");
                status.textContent = "Recorded — play it back or record again";
              };
              reader.readAsDataURL(blob);
              if (activeStream) {
                activeStream.getTracks().forEach(function (t) { t.stop(); });
                activeStream = null;
              }
            };
            mediaRecorder.start();
            activeStream = stream;
            recording = true;
            recBtn.textContent = "Stop";
            status.textContent = "Listening… speak into your mic";
          }).catch(function () {
            status.textContent = "Microphone permission was denied.";
          });
        } else {
          mediaRecorder.stop();
          recording = false;
          recBtn.textContent = "Record again";
        }
      });
      form.appendChild(el("label", { class: "field-label", text: "Voice memo" }));
      form.appendChild(voiceUI);
      form._collect = function () { return draft.fileUrl ? draft : null; };
      form._teardown = function () {
        if (recording && mediaRecorder && mediaRecorder.state !== "inactive") {
          try { mediaRecorder.stop(); } catch (err) {}
        }
        if (activeStream) {
          activeStream.getTracks().forEach(function (t) { t.stop(); });
        }
      };
    }

    if (type === "drawing") {
      var drawPad = createDrawPad();
      var capDraw = el("input", { type: "text", placeholder: "caption (optional)" });
      form.appendChild(el("label", { class: "field-label", text: "Draw something" }));
      form.appendChild(drawPad.root);
      addField("Caption", capDraw);
      form._collect = function () {
        if (!drawPad.hasInk()) return null;
        draft.fileUrl = drawPad.canvas.toDataURL("image/png");
        draft.caption = capDraw.value.trim();
        return Promise.resolve(draft);
      };
    }

    var addBtn = el("button", {
      type: "button", text: "Add to package",
      onclick: function () {
        addBtn.disabled = true;
        addBtn.textContent = "Adding...";
        Promise.resolve(form._collect()).then(function (item) {
          addBtn.disabled = false;
          addBtn.textContent = "Add to package";
          if (!item) return;
          state.items.push(item);
          renderItemList();
          closeForm();
        }).catch(function (err) {
          addBtn.disabled = false;
          addBtn.textContent = "Add to package";
          alert("Couldn't add item: " + err.message);
        });
      }
    });

    var buttons = el("div", { class: "row-buttons" }, [
      addBtn,
      el("button", { type: "button", class: "secondary", text: "Cancel", onclick: closeForm })
    ]);
    form.appendChild(buttons);
    host.appendChild(form);

    backdrop.hidden = false;
    backdrop.classList.add("visible");
    document.body.classList.add("modal-open");
  }

  function createDrawPad() {
    var W = 560, H = 420;
    var color = DRAW_COLORS[0];
    var size = 4;
    var drawing = false;
    var hasMarks = false;
    var lastX = 0, lastY = 0;

    var canvas = el("canvas", { class: "draw-canvas", width: String(W), height: String(H) });
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff8f4";
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    function pos(e) {
      var rect = canvas.getBoundingClientRect();
      var src = e.touches && e.touches[0] ? e.touches[0] : e;
      return {
        x: (src.clientX - rect.left) * (W / rect.width),
        y: (src.clientY - rect.top) * (H / rect.height)
      };
    }

    function start(e) {
      e.preventDefault();
      drawing = true;
      var p = pos(e);
      lastX = p.x;
      lastY = p.y;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      hasMarks = true;
    }

    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      var p = pos(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.stroke();
      lastX = p.x;
      lastY = p.y;
      hasMarks = true;
    }

    function end(e) {
      if (e) e.preventDefault();
      drawing = false;
    }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);

    var colors = el("div", { class: "draw-colors" });
    DRAW_COLORS.forEach(function (c, idx) {
      var swatch = el("button", {
        type: "button",
        class: "draw-swatch" + (idx === 0 ? " active" : "") + (c === "#ffffff" ? " light" : ""),
        style: "background:" + c,
        onclick: function () {
          color = c;
          Array.prototype.forEach.call(colors.children, function (n) { n.classList.remove("active"); });
          swatch.classList.add("active");
        }
      });
      colors.appendChild(swatch);
    });

    var clearBtn = el("button", {
      type: "button", class: "small secondary", text: "clear",
      onclick: function () {
        ctx.fillStyle = "#fff8f4";
        ctx.fillRect(0, 0, W, H);
        hasMarks = false;
      }
    });

    var tools = el("div", { class: "draw-tools" }, [colors, clearBtn]);
    var root = el("div", { class: "draw-pad" }, [canvas, tools]);

    return { root: root, canvas: canvas, hasInk: function () { return hasMarks; } };
  }

  function itemSummary(item) {
    if (item.type === "note") return item.text;
    if (item.type === "photo") return item.caption || "photo";
    if (item.type === "song") return item.title || item.url;
    if (item.type === "video") return item.caption || item.url;
    if (item.type === "gift") return item.url;
    if (item.type === "voice") return "voice memo";
    if (item.type === "drawing") return item.caption || "hand drawing";
    if (item.type === "map") return item.title || item.url;
    if (item.type === "coupon") return item.title || "coupon";
    if (item.type === "news") return item.title || item.url;
    return "";
  }

  function itemThumb(item) {
    if ((item.type === "photo" || item.type === "drawing") && (item.fileUrl || item.file_url)) {
      return item.fileUrl || item.file_url;
    }
    return getAssetPath(THUMBS[item.type]);
  }

  function renderItemList() {
    var list = document.getElementById("itemList");
    if (!list) return;
    list.innerHTML = "";
    state.items.forEach(function (item, idx) {
      var row = el("div", { class: "item-row" }, [
        el("img", { src: itemThumb(item), alt: item.type }),
        el("div", { class: "meta" }, [
          el("div", { class: "t", text: LABELS[item.type] }),
          el("div", { class: "s", text: itemSummary(item) })
        ]),
        el("div", { class: "actions" }, [
          el("button", {
            class: "small danger", type: "button", text: "remove",
            onclick: function () {
              state.items.splice(idx, 1);
              renderItemList();
            }
          })
        ])
      ]);
      list.appendChild(row);
    });
  }

  function collectState() {
    state.title = document.getElementById("pkgTitle").value.trim() || "cutie";
    state.from = document.getElementById("pkgFrom").value.trim() || "bestie";
    return state;
  }

  function showError(msg) {
    var box = document.getElementById("errorMsg");
    if (!box) return;
    box.textContent = msg;
    box.style.display = msg ? "block" : "none";
  }

  function generateClientLink() {
    showError("");
    var pkg = collectState();
    if (pkg.items.length === 0) {
      showError("Add at least one item before generating a link.");
      return;
    }

    var jsonStr = JSON.stringify({
      t: pkg.title,
      f: pkg.from,
      i: pkg.items
    });
    var encoded = btoa(encodeURIComponent(jsonStr));
    var fullUrl = location.origin + location.pathname + "#pkg=" + encoded;

    var out = document.getElementById("linkOutput");
    if (out) out.value = fullUrl;

    var shareInput = document.getElementById("shareSuccessLink");
    if (shareInput) shareInput.value = fullUrl;

    var backdrop = document.getElementById("shareSuccessBackdrop");
    if (backdrop) {
      backdrop.hidden = false;
      backdrop.classList.add("visible");
      document.body.classList.add("modal-open");
    }
  }

  function closeShareSuccessPopup() {
    var backdrop = document.getElementById("shareSuccessBackdrop");
    if (!backdrop) return;
    backdrop.classList.remove("visible");
    backdrop.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function copyShareLink(inputId, copiedId) {
    var input = document.getElementById(inputId);
    var copied = document.getElementById(copiedId);
    if (!input || !input.value) return;
    var done = function () {
      if (copied) {
        copied.hidden = false;
        setTimeout(function () { copied.hidden = true; }, 2000);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(done).catch(function () {
        input.select();
        document.execCommand("copy");
        done();
      });
    } else {
      input.select();
      document.execCommand("copy");
      done();
    }
  }

  function enterPreview() {
    showError("");
    var pkg = collectState();
    if (pkg.items.length === 0) {
      showError("Add at least one item before previewing.");
      return;
    }
    renderRecipientView(pkg);
  }

  function spawnHeartBurst(evt) {
    var hearts = ["❤️", "💖", "💕", "💗", "✨", "💓", "💌"];
    var x = evt ? evt.clientX : (window.innerWidth / 2);
    var y = evt ? evt.clientY : (window.innerHeight / 2);
    for (var i = 0; i < 14; i++) {
      var heart = document.createElement("span");
      heart.className = "floating-heart-particle";
      heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];
      heart.style.left = (x + (Math.random() * 60 - 30)) + "px";
      heart.style.top = (y + (Math.random() * 40 - 20)) + "px";
      heart.style.setProperty("--dx", (Math.random() * 140 - 70) + "px");
      heart.style.setProperty("--dy", (-80 - Math.random() * 120) + "px");
      heart.style.setProperty("--rot", (Math.random() * 80 - 40) + "deg");
      document.body.appendChild(heart);
      (function(h) {
        setTimeout(function() { if (h.parentNode) h.parentNode.removeChild(h); }, 1200);
      })(heart);
    }
  }

  function renderRecipientView(pkg) {
    document.documentElement.classList.add("is-recipient", "is-preview");
    document.getElementById("builderView").style.display = "none";
    document.getElementById("recipientView").style.display = "flex";
    document.getElementById("notfoundMsg").style.display = "none";
    document.getElementById("stage").style.display = "block";
    document.getElementById("boxScreen").classList.remove("hidden");
    document.getElementById("openScreen").classList.remove("visible");

    document.getElementById("rTitle").textContent = "you've got mail ❤️";
    document.getElementById("rFrom").textContent = "";
    document.getElementById("boxLabelTo").textContent = "TO: " + (pkg.title || "cutie");
    document.getElementById("boxLabelFrom").textContent = "FROM: " + (pkg.from || "bestie");

    document.getElementById("boxImg").src = getAssetPath("assets/care-package-box.webp");

    var openBtn = document.getElementById("openBtn");
    openBtn.onclick = function (e) {
      spawnHeartBurst(e);
      document.getElementById("boxScreen").classList.add("hidden");
      document.getElementById("openScreen").classList.add("visible");
      renderFloaties(pkg);
    };
  }

  function renderFloaties(pkg) {
    var host = document.getElementById("floatyHost");
    if (!host) return;
    host.innerHTML = "";
    document.getElementById("oTitle").textContent = "your little box of goodies";
    (pkg.items || []).forEach(function (item) {
      var isPhoto = item.type === "photo" || item.type === "drawing";
      var cardClass = "floaty" + (isPhoto ? " floaty--polaroid" : "");
      var imgUrl = itemThumb(item);
      var labelText = LABELS[item.type] || itemSummary(item);

      var btn = el("button", { type: "button" }, [
        isPhoto
          ? el("div", { class: "polaroid" }, [el("img", { src: imgUrl, alt: item.type })])
          : el("img", { src: imgUrl, alt: item.type }),
        el("div", { class: "fl-label", text: labelText })
      ]);

      btn.onclick = function () { openItemModal(item); };

      var wrap = el("div", { class: cardClass }, [btn]);
      host.appendChild(wrap);
    });

    // Lay out floaties in grid
    var floaties = host.querySelectorAll(".floaty");
    floaties.forEach(function (f, idx) {
      f.style.position = "relative";
      f.style.display = "inline-block";
      f.style.margin = "12px";
      f.style.transform = "rotate(" + ((idx % 3 === 0 ? -4 : idx % 2 === 0 ? 3 : -2)) + "deg)";
    });
  }

  function openItemModal(item) {
    var backdrop = document.getElementById("modalBackdrop");
    var body = document.getElementById("modalBody");
    body.innerHTML = "";

    if (item.type === "note") {
      body.appendChild(el("div", { class: "note-text", text: item.text }));
    } else if (item.type === "photo" || item.type === "drawing") {
      if (item.fileUrl || item.file_url) {
        body.appendChild(el("img", { class: "full", src: item.fileUrl || item.file_url, alt: "Photo" }));
      }
      if (item.caption) {
        body.appendChild(el("div", { class: "note-text", text: item.caption }));
      }
    } else if (item.type === "voice" && (item.fileUrl || item.file_url)) {
      var player = createVoicePlayer(item.fileUrl || item.file_url);
      body.appendChild(player.root);
    } else if (item.type === "video") {
      if (item.fileUrl || item.file_url) {
        body.appendChild(el("video", { class: "full-video", src: item.fileUrl || item.file_url, controls: true, autoplay: true }));
      } else if (item.url) {
        body.appendChild(el("a", { class: "link-out", href: item.url, target: "_blank", text: "Watch Video →" }));
      }
      if (item.caption) {
        body.appendChild(el("div", { class: "note-text", text: item.caption }));
      }
    } else {
      body.appendChild(el("div", { class: "note-text", text: itemSummary(item) }));
      if (item.url) {
        body.appendChild(el("a", { class: "link-out", href: item.url, target: "_blank", text: "Open Link →" }));
      }
    }

    backdrop.hidden = false;
    backdrop.classList.add("visible");
    document.body.classList.add("modal-open");
  }

  function exitPreview() {
    document.documentElement.classList.remove("is-recipient", "is-preview");
    document.getElementById("recipientView").style.display = "none";
    document.getElementById("builderView").style.display = "block";
    window.location.hash = "";
  }

  function checkHashRoute() {
    var hash = window.location.hash;
    if (hash && hash.indexOf("#pkg=") === 0) {
      try {
        var jsonStr = decodeURIComponent(atob(hash.replace("#pkg=", "")));
        var data = JSON.parse(jsonStr);
        renderRecipientView({
          title: data.t || "cutie",
          from: data.f || "bestie",
          items: data.i || []
        });
      } catch (err) {
        console.error("Invalid package link", err);
      }
    }
  }

  // ---------- Init ----------
  function init() {
    renderTypeGrid();
    renderItemList();

    var genBtn = document.getElementById("generateBtn");
    if (genBtn) genBtn.addEventListener("click", generateClientLink);

    var prevBtn = document.getElementById("previewBtn");
    if (prevBtn) prevBtn.addEventListener("click", enterPreview);

    var editBtn = document.getElementById("editPkgBtn");
    if (editBtn) editBtn.addEventListener("click", exitPreview);

    var sendLoveBtn = document.getElementById("sendLoveBtn");
    if (sendLoveBtn) {
      sendLoveBtn.addEventListener("click", function (e) {
        spawnHeartBurst(e);
        sendLoveBtn.textContent = "Hug Sent! 🥰";
        var msg = document.getElementById("loveSentMsg");
        if (msg) msg.hidden = false;
      });
    }

    var itemFormClose = document.getElementById("itemFormClose");
    if (itemFormClose) {
      itemFormClose.addEventListener("click", function () {
        var backdrop = document.getElementById("itemFormBackdrop");
        backdrop.hidden = true;
        backdrop.classList.remove("visible");
        document.body.classList.remove("modal-open");
      });
    }

    var modalClose = document.getElementById("modalClose");
    if (modalClose) {
      modalClose.addEventListener("click", function () {
        var backdrop = document.getElementById("modalBackdrop");
        backdrop.hidden = true;
        backdrop.classList.remove("visible");
        document.body.classList.remove("modal-open");
      });
    }

    var copyBtn = document.getElementById("copyBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        copyShareLink("linkOutput", "copiedMsg");
      });
    }

    var shareCopyBtn = document.getElementById("shareSuccessCopy");
    if (shareCopyBtn) {
      shareCopyBtn.addEventListener("click", function () {
        copyShareLink("shareSuccessLink", "shareSuccessCopied");
      });
    }

    var shareCloseBtn = document.getElementById("shareSuccessClose");
    if (shareCloseBtn) shareCloseBtn.addEventListener("click", closeShareSuccessPopup);

    var shareDoneBtn = document.getElementById("shareSuccessDone");
    if (shareDoneBtn) shareDoneBtn.addEventListener("click", closeShareSuccessPopup);

    window.addEventListener("hashchange", checkHashRoute);
    checkHashRoute();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
