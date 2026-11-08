/* INSPECTOR: details for the selection, the processing order, and the patching rules.
   P.ui.inspector(actions) → { el, update(state) }
   · Node selected: order badge, name, LED bypass, role, param controls, port table, latency, REMOVE.
   · Cable selected: kind, from → to, note, DISCONNECT.
   The panel is rebuilt (with a staggered entrance) only when what it shows changes shape;
   param changes are synced in place so sliders keep their drag.
   Uses: led-bypass, param-control (→ knob). */
(function (P) {
  'use strict';
  const { h, T, C, KC } = P;

  P.ui.inspector = function (actions) {
    const slot = h('div', { class: 'p-insp-slot' });
    const orderList = h('ol', { class: 'p-insp-order' });
    const el = h('aside', { class: 'p-insp', 'aria-label': 'Inspector' },
      h('span', { class: 'p-micro', text: 'INSPECTOR' }),
      slot,
      h('div', { class: 'p-insp-box' }, h('span', { class: 'p-micro', text: 'PROCESSING ORDER' }), orderList),
      h('div', { class: 'p-insp-rules' },
        h('span', { class: 'p-micro', text: 'RULES' }),
        h('span', { text: 'Outputs fan out. Audio inputs sum.' }),
        h('span', { text: 'Sidechain inputs take one cable only.' }),
        h('span', { text: 'Loops are legal only through a DELAY.' }),
        h('span', { text: 'Latency is compensated automatically.' })));

    let panelKey = null, orderKey = null, live = null;

    function nodePanel(s, D, n) {
      const d = T[n.type];
      const portRows = d.ins.map((lab, k) => {
        const c = s.edges.filter((e) => e.b === n.id && e.bp === k).length;
        return ['IN · ' + lab, lab === 'SC' ? (c ? '1 KEY' : 'OPEN') : c > 1 ? c + ' · SUMMED' : c ? '1 CABLE' : 'OPEN'];
      }).concat(d.outs.map((lab, k) => {
        const c = s.edges.filter((e) => e.a === n.id && e.ap === k).length;
        return ['OUT · ' + lab, c > 1 ? c + ' · FAN-OUT' : c ? '1 CABLE' : 'OPEN'];
      }));
      const key = ['node', n.id, P.orderTag(D, n.id), JSON.stringify(portRows)].join('|');
      if (key === panelKey && live) { live.sync(n); return; }

      const led = d.bypass ? P.ui.ledBypass({ on: n.on, color: d.color, label: 'Bypass ' + P.label(n), onToggle: () => actions.toggleNode(n.id) }) : null;
      const params = d.params.map(([k, kind]) => P.ui.paramControl({
        label: k, kind, v: n.p[k], color: P.knobColor(d.color), aria: P.label(n) + ' ' + k,
        onInput: (v) => actions.setParam(n.id, k, v)
      }));
      const card = h('div', { class: 'p-insp-card' },
        h('div', { class: 'p-insp-id' },
          h('span', { class: 'p-insp-badge p-display', style: { '--node': d.color }, text: P.orderTag(D, n.id) }),
          h('div', { class: 'p-insp-names' },
            h('span', { class: 'p-insp-name p-display', text: P.label(n) }),
            h('span', { class: 'p-micro', text: d.cat + (n.name ? ' · ' + d.name : '') })),
          led && led.el),
        h('p', { class: 'p-insp-role', text: d.role }),
        params.length && h('div', { class: 'p-insp-params' }, params.map((p) => p.el)),
        h('dl', { class: 'p-insp-dl' },
          portRows.map(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]),
          h('dt', { text: 'LATENCY' }), h('dd', { text: (d.lat ? d.lat + ' SMP' : '0') + (d.breaks ? ' · BREAKS LOOPS' : '') })),
        !d.fixed && h('button', { type: 'button', class: 'p-btn quiet', onClick: () => actions.removeNode(n.id) }, 'REMOVE NODE'));
      swap(card, key, {
        sync(nn) {
          if (led) led.update({ on: nn.on });
          d.params.forEach(([k], i) => params[i].update({ v: nn.p[k] }));
        }
      });
      live.sync(n);
    }

    function edgePanel(s, D, ed) {
      const k = D.A.kind[ed.id], a = D.byId[ed.a], b = D.byId[ed.b];
      const key = ['edge', ed.id, k].join('|');
      if (key === panelKey) return;
      const col = KC[k] === KC.audio ? C.ink : KC[k];
      const card = h('div', { class: 'p-insp-card', style: { '--kind': col } },
        h('div', { class: 'p-insp-id' },
          h('span', { class: 'p-insp-swatch' }),
          h('span', { class: 'p-insp-name p-display', text: 'CABLE' }),
          h('span', { class: 'p-insp-kind', text: P.KIND_LABEL[k] })),
        h('div', { class: 'p-insp-route' },
          h('span', {}, h('span', { class: 'p-insp-k', text: 'FROM' }), '  ' + P.label(a) + ' · ' + T[a.type].outs[ed.ap]),
          h('span', {}, h('span', { class: 'p-insp-k', text: 'TO' }), '    ' + P.label(b) + ' · ' + T[b.type].ins[ed.bp])),
        h('p', { class: 'p-insp-role', text: P.KIND_NOTE[k] }),
        h('button', { type: 'button', class: 'p-btn', onClick: () => actions.removeEdge(ed.id) }, 'DISCONNECT'));
      swap(card, key, null);
    }

    function swap(card, key, ctl) {
      const old = slot.firstElementChild;
      if (old) old.remove();
      if (card) {
        slot.append(card);
        P.animate(card, { opacity: [0, 1], translateY: [8, 0], duration: 420, ease: 'outQuart' });
        P.animate(Array.from(card.children), { opacity: [0, 1], translateY: [6, 0], delay: P.stagger(40, { start: 60 }), duration: 420, ease: 'outQuart' });
      }
      panelKey = key; live = ctl;
    }

    function update(s) {
      const D = P.derive(s), sel = s.sel;
      if (sel && sel.kind === 'node' && D.byId[sel.id]) nodePanel(s, D, D.byId[sel.id]);
      else if (sel && sel.kind === 'edge' && s.edges.some((e) => e.id === sel.id && D.byId[e.a] && D.byId[e.b])) edgePanel(s, D, s.edges.find((e) => e.id === sel.id));
      else if (panelKey !== null) swap(null, null, null);

      const rows = D.A.order.map((id, i) => [P.pad2(i + 1), P.label(D.byId[id]), D.byId[id].on ? 'on' : 'off'])
        .concat(s.nodes.filter((n) => !D.orderIdx[n.id]).map((n) => ['!', P.label(n), 'bad']));
      const ok = JSON.stringify(rows);
      if (ok !== orderKey) {
        const firstFill = orderKey === null;
        orderKey = ok;
        orderList.replaceChildren(...rows.map(([n, name, c]) => h('li', { class: c }, h('span', { class: 'p-insp-n', text: n }), name)));
        P.animate(Array.from(orderList.children), { opacity: [0, 1], translateX: [-6, 0], delay: P.stagger(firstFill ? 35 : 18), duration: 360, ease: 'outQuad' });
      }
    }
    return { el, update };
  };
})(window.Patch);
