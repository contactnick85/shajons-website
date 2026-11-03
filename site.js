(function () {
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

  var form = document.getElementById('enquiry');
  if (!form) return;
  var msg = document.getElementById('msg');
  var live = /(^|\.)shajons\.com$/.test(location.hostname) || /\.netlify\.app$/.test(location.hostname);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = form.elements['name'].value.trim();
    var email = form.elements['email'].value.trim();
    if (!name || !/\S+@\S+\.\S+/.test(email)) {
      msg.textContent = 'Please enter your name and a valid email address.';
      return;
    }
    if (!live) {
      msg.textContent = 'Preview only: the form sends enquiries once the site is live on shajons.com.';
      return;
    }
    var body = new URLSearchParams(new FormData(form)).toString();
    msg.textContent = 'Sending...';
    fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body })
      .then(function (r) {
        if (!r.ok) throw new Error('bad status');
        form.reset();
        msg.textContent = 'Thank you. Your enquiry has been received and a member of our team will respond shortly.';
      })
      .catch(function () {
        msg.textContent = 'Sorry, we could not send your enquiry. Please try again in a moment.';
      });
  });
})();
