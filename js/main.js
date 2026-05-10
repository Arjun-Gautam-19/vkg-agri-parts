// Mobile nav toggle + minor UI helpers
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      nav.classList.toggle('open');
    });
  }

  // Inquiry form submission handler (Formspree)
  const form = document.querySelector('form.inquiry');
  if (form) {
    const status = form.querySelector('.form-status');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      fetch(form.action, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json'
        }
      }).then(response => {
        if (response.ok) {
          status.className = 'form-status ok';
          status.textContent = 'Thanks! Your inquiry has been received. Our team will get back to you within one business day.';
          form.reset();
        } else {
          status.className = 'form-status err';
          status.textContent = 'There was an error submitting your inquiry. Please try again.';
        }
      }).catch(error => {
        status.className = 'form-status err';
        status.textContent = 'There was an error submitting your inquiry. Please try again.';
      });
    });
  }
});
