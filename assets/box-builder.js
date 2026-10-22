/* Box su misura (snippets/box-builder.liquid): scatti da 1 kg fino a data-max, aggiunta al carrello
   di tutte le righe insieme con la stessa proprietà _box. */
if (!customElements.get('box-builder')) {
  customElements.define(
    'box-builder',
    class BoxBuilder extends HTMLElement {
      connectedCallback() {
        this.max = parseInt(this.dataset.max, 10);
        this.items = Array.from(this.querySelectorAll('.box-builder__item')).filter((item) =>
          item.querySelector('.box-builder__step')
        );
        this.quantities = new Map(this.items.map((item) => [item, 0]));
        this.submitButton = this.querySelector('[data-box-submit]');

        this.items.forEach((item) => {
          item.querySelectorAll('.box-builder__step').forEach((button) => {
            button.addEventListener('click', () => this.step(item, parseInt(button.dataset.step, 10)));
          });
        });
        this.submitButton.addEventListener('click', () => this.addToCart());
        this.update();
      }

      get totalKg() {
        let total = 0;
        this.quantities.forEach((qty) => (total += qty));
        return total;
      }

      step(item, delta) {
        const next = this.quantities.get(item) + delta;
        if (next < 0 || this.totalKg + delta > this.max) return;
        this.quantities.set(item, next);
        this.update();
      }

      update() {
        const totalKg = this.totalKg;
        let totalCents = 0;
        let preorder = null;

        this.quantities.forEach((qty, item) => {
          item.querySelector('.box-builder__qty span').textContent = qty;
          item.querySelector('[data-step="-1"]').disabled = qty === 0;
          item.querySelector('[data-step="1"]').disabled = totalKg >= this.max;
          item.classList.toggle('box-builder__item--selected', qty > 0);
          totalCents += qty * parseInt(item.dataset.price, 10);
          if (qty > 0 && item.dataset.preorderIso && (!preorder || item.dataset.preorderIso > preorder.iso)) {
            preorder = { iso: item.dataset.preorderIso, date: item.dataset.preorderDate };
          }
        });

        const remaining = this.max - totalKg;
        this.querySelector('[data-box-kg]').textContent = totalKg;
        this.querySelector('[data-box-remaining]').textContent =
          remaining > 0 ? this.dataset.textRemaining.replace('[kg]', remaining) : this.dataset.textFull;
        this.querySelector('[data-box-total]').textContent = this.formatMoney(totalCents);
        this.querySelector('.box-builder__bar').style.width = `${(totalKg / this.max) * 100}%`;
        this.classList.toggle('box-builder--full', remaining === 0);

        const preorderNote = this.querySelector('[data-box-preorder]');
        preorderNote.hidden = !preorder;
        if (preorder) preorderNote.textContent = this.dataset.textPreorder.replace('[date]', preorder.date);
        this.preorder = preorder;

        this.submitButton.disabled = remaining !== 0;
      }

      formatMoney(cents) {
        const format = this.dataset.moneyFormat || '{{amount}}';
        const amount = (cents / 100).toFixed(2);
        const [whole, decimals] = amount.split('.');
        return format.replace(/\{\{\s*(\w+)\s*\}\}/, (match, key) => {
          if (key === 'amount_with_comma_separator') return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimals}`;
          if (key === 'amount_no_decimals') return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          if (key === 'amount_no_decimals_with_comma_separator') return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
          return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimals}`;
        });
      }

      async addToCart() {
        if (this.totalKg !== this.max) return;
        const boxId = `BOX-${Date.now().toString(36).toUpperCase()}`;
        const properties = { _box: boxId };
        if (this.preorder) properties[this.dataset.propertyShipping] = this.preorder.date;

        const items = [];
        this.quantities.forEach((qty, item) => {
          if (qty > 0) items.push({ id: parseInt(item.dataset.variantId, 10), quantity: qty, properties });
        });

        const cart = document.querySelector('cart-drawer');
        const body = { items };
        if (cart) {
          body.sections = cart.getSectionsToRender().map((section) => section.id);
          body.sections_url = window.location.pathname;
        }

        const errorEl = this.querySelector('[data-box-error]');
        errorEl.hidden = true;
        this.submitButton.setAttribute('aria-disabled', 'true');
        this.submitButton.classList.add('loading');
        this.submitButton.querySelector('.loading__spinner').classList.remove('hidden');

        try {
          const response = await fetch(`${window.routes.cart_add_url}.js`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
          });
          const state = await response.json();
          if (!response.ok || state.status) throw new Error(state.description || state.message);

          if (cart && state.sections) {
            cart.classList.remove('is-empty');
            cart.renderContents(state);
          } else {
            window.location = window.routes.cart_url;
          }
          this.quantities.forEach((qty, item) => this.quantities.set(item, 0));
          this.update();
        } catch (error) {
          errorEl.textContent = error.message || this.dataset.textError;
          errorEl.hidden = false;
        } finally {
          this.submitButton.removeAttribute('aria-disabled');
          this.submitButton.classList.remove('loading');
          this.submitButton.querySelector('.loading__spinner').classList.add('hidden');
        }
      }
    }
  );
}

/* Carrello: le righe di una box si rimuovono tutte insieme (quantità bloccate) */
if (!customElements.get('box-remove-button')) {
  customElements.define(
    'box-remove-button',
    class BoxRemoveButton extends HTMLElement {
      connectedCallback() {
        this.querySelector('button').addEventListener('click', async (event) => {
          event.preventDefault();
          this.querySelector('button').disabled = true;
          const cart = await fetch(`${window.routes.cart_url}.js`).then((response) => response.json());
          const updates = {};
          cart.items
            .filter((item) => item.properties && item.properties._box === this.dataset.box)
            .forEach((item) => (updates[item.key] = 0));
          await fetch(`${window.routes.cart_update_url}.js`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ updates }),
          });
          window.location.reload();
        });
      }
    }
  );
}
