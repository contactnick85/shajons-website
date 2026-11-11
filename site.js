(function () {
  // Swap in live Tablyvio screenshots when reachable; bundled placeholders stay otherwise.
  Array.prototype.forEach.call(document.querySelectorAll('img[data-remote]'), function (img) {
    function tryLoad(urls) {
      if (!urls.length) return;
      var t = new Image();
      t.onload = function () { img.src = t.src; };
      t.onerror = function () { tryLoad(urls.slice(1)); };
      t.src = urls[0];
    }
    tryLoad([img.getAttribute('data-remote'), img.getAttribute('data-remote2')].filter(Boolean));
  });
  var nav = document.getElementById('nav');
  var btn = document.getElementById('menu');
  if (nav && btn) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? 'Close' : 'Menu';
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = 'Menu';
      }
    });
  }
  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  var live = /(^|\.)shajons\.com$/.test(location.hostname) || /\.netlify\.app$/.test(location.hostname);
  var forms = document.querySelectorAll('form[data-netlify]');
  Array.prototype.forEach.call(forms, function (form) {
    var msg = form.querySelector('.msg') || document.getElementById('msg');
    var okText = form.name === 'candidate' ? 'Thank you. Your application and CV have been received. Our recruiters will contact you when a suitable role opens.'
      : form.name === 'employer' ? 'Thank you. Your hiring request has been received and a recruiter will contact you shortly.'
      : 'Thank you. Your inquiry has been received and a member of our team will respond shortly.';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var emailEl = form.querySelector('input[type=email]');
      var nameEl = form.querySelector('input[name=name], input[id$="-name"]');
      var missing = Array.prototype.some.call(form.querySelectorAll('[required]'), function (el) {
        return el.type === 'checkbox' ? !el.checked : !String(el.value || '').trim();
      });
      if (missing || (emailEl && !/\S+@\S+\.\S+/.test(emailEl.value.trim()))) {
        msg.textContent = 'Please complete the required fields (*) and enter a valid email address.';
        return;
      }
      var fileEl = form.querySelector('input[type=file]');
      var file = fileEl && fileEl.files[0];
      if (file && file.size > 4 * 1024 * 1024) {
        msg.textContent = 'Your file is larger than 4 MB. Please upload a smaller CV (PDF or Word).';
        return;
      }
      if (!live) {
        msg.textContent = 'Preview only: the form sends once the site is live on shajons.com.';
        return;
      }
      var fields = {};
      new FormData(form).forEach(function (v, k) {
        if (v instanceof File) return;
        if (fields[k] === undefined) fields[k] = v;
        else fields[k] = [].concat(fields[k], v);
      });
      var formName = (fields['form-name'] || form.name || 'inquiry');
      function readFile(f) {
        return new Promise(function (res, rej) {
          if (!f) return res(null);
          var fr = new FileReader();
          fr.onload = function () { res({ name: f.name, data: String(fr.result).split(',')[1] }); };
          fr.onerror = rej;
          fr.readAsDataURL(f);
        });
      }
      msg.textContent = 'Sending...';
      readFile(file)
        .then(function (resume) {
          return fetch('/.netlify/functions/send-form', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ form: formName, fields: fields, resume: resume })
          });
        })
        .then(function (r) {
          if (!r.ok) throw new Error('bad status');
          // Keep a text-only copy in Netlify Forms as a backup record (CV is not re-sent).
          try { fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(Object.assign({}, fields, { 'form-name': formName })).toString() }); } catch (x) {}
          form.reset();
          msg.textContent = okText;
        })
        .catch(function () {
          msg.textContent = 'Sorry, we could not send this. Please try again in a moment, or email john@shajons.com or message us on WhatsApp.';
        });
    });
  });
})();
