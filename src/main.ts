import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";
import { query } from "lit/decorators/query.js";
import { state } from "lit/decorators/state.js";
import { debounce, conditionalClamp } from "./utils";
import { getController } from "./controllers/get-controller";
import { Controller, ControllerConfig } from "./controllers/controller";
import pjson from "../package.json";

import "./editor.ts";

const DEFAULT_DEBOUNCE_TIME = 1000;

class SliderEntityRow extends LitElement {
  _config: ControllerConfig;
  ctrl: Controller;

  @property() hass: any;
  @property() hide_state: boolean;
  @property() show_step_buttons: boolean;
  @state() _isDragging: boolean = false;
  @state() _value: number;
  @state() _isPending: boolean = false;
  _pendingTimer?: number;
  @query("ha-slider") _slider?;

  private _incrementValue(e: MouseEvent) {
    e.stopPropagation();
    this._processNewValue(this._value + this.ctrl.step);
  }

  private _decrementValue(e: MouseEvent) {
    e.stopPropagation();
    this._processNewValue(this._value - this.ctrl.step);
  }

  private _processNewValue(value) {
    const newValue = conditionalClamp(value, this.ctrl.min, this.ctrl.max);
    if (this.ctrl.value !== newValue) {
      this._value = newValue;
      this._isPending = true;
      this.debounceUpdateValue(newValue);
    }
  }

  private updateValue = (value: number) => {
    this.ctrl.value = value;
  };

  private debounceUpdateValue = this.updateValue;

  setConfig(config: ControllerConfig) {
    if (config.attribute === "color_temp_mired")
      throw Error("color_temp_mired has been removed");

    this._config = config;
    if (!config.entity) throw new Error(`No entity specified.`);
    const domain = config.entity.split(".")[0];
    const ctrlClass = getController(domain);
    if (!ctrlClass) throw new Error(`Unsupported entity type: ${domain}`);
    this.ctrl = new ctrlClass(config, this);
  }

  static getConfigElement() {
    console.log("GetConfigElement");
    return document.createElement("slider-entity-row-editor");
  }

  async resized() {
    await this.updateComplete;
    if (!this.shadowRoot || !this.parentElement) return;
    this.hide_state = this._config.full_row
      ? this.parentElement?.clientWidth <= 180
      : this.parentElement?.clientWidth <= 335;
    return;
  }

  async firstUpdated() {
    this.debounceUpdateValue = debounce(this.updateValue, DEFAULT_DEBOUNCE_TIME);
    await this.resized();
  }

  async updated() {
    // Sync _value from controller when hass/state updates, but don't override while dragging
    if (this.ctrl && this.ctrl.stateObj) {
      const newVal = this.ctrl.value;
      if (this._value === undefined) {
        this._value = newVal;
      } else if (this._isPending) {
        // We recently set the value locally; wait until HA reports the new value
        if (newVal === this._value) {
          this._isPending = false;
          if (this._pendingTimer) {
            window.clearTimeout(this._pendingTimer);
            this._pendingTimer = undefined;
          }
        }
      } else if (!this._isDragging && newVal !== this._value) {
        this._value = newVal;
      }
    }

    if (!this._slider) return;
    await this._slider.updateComplete;
    if (this._slider.shadowRoot.querySelector("style.slider-entity-row"))
      return;
    const styleEl = document.createElement("style");
    styleEl.classList.add("slider-entity-row");
    styleEl.innerHTML = `.container .track::before{background: var(--_inactive-track-color);}
    .container .track::after{background: var(--_active-track-color);}`;
    this._slider.shadowRoot?.appendChild(styleEl);
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.resized();
  }

  render() {
    const c = this.ctrl;
    c.hass = this.hass;
    if (!c.stateObj)
      return html`
        <hui-warning>
          ${this.hass.localize(
        "ui.panel.lovelace.warning.entity_not_found",
        "entity",
        this._config.entity
      )}
        </hui-warning>
      `;

    const dir =
      c.dir ??
        this.hass.translationMetadata.translations[this.hass.language || "en"]
          .isRTL
        ? "rtl"
        : "ltr";

    const showSlider =
      c.stateObj.state !== "unavailable" &&
      c.hasSlider &&
      !(c.isOff && this._config.hide_when_off);
    const showToggle = this._config.toggle && c.hasToggle;
    const showValue = showToggle
      ? false
      : this._config.hide_state === false
        ? true
        : this._config.hide_state || this.hide_state
          ? false
          : c.isOff && this._config.hide_when_off
            ? false
            : true;

    const content = html`
      <div class="wrapper" @click=${(ev) => ev.stopPropagation()}>
        ${showSlider
        ? html`
              ${this._config.colorize && c.background
            ? html`
                    <style>
                      ha-slider::part(track) {
                        background: ${c.background};
                      }
                      ha-slider::part(indicator) {
                        background: transparent;
                      }
                      ha-slider {
                        --paper-slider-container-color: ${c.background};
                        --_inactive-track-color: ${c.background};
                        --_active-track-color: ${c.background};
                        --paper-progress-active-color: transparent;
                      }
                    </style>
                  `
            : ""}
              <ha-slider
                .min=${c.min}
                .max=${c.max}
                .step=${c.step}
                .value=${this._value}
                .dir=${dir}
                .withTooltip=${false}
                labeled
                pin
                @input=${(ev) => {
            this._isDragging = true;
            this._value = (
              this.shadowRoot.querySelector("ha-slider") as any
            ).value;
          }}
                @change=${(ev) => {
            this._isDragging = false;
            const v = (
              this.shadowRoot.querySelector("ha-slider") as any
            ).value;
            // Mark that we set the value locally and are waiting for HA to update
            this._isPending = true;
            if (this._pendingTimer) window.clearTimeout(this._pendingTimer);
            this._pendingTimer = window.setTimeout(() => {
              this._isPending = false;
              this._pendingTimer = undefined;
            }, 10000);
            c.value = v;
          }}
                class=${this._config.full_row || this._config.grow
            ? "full test"
            : ""}
                ignore-bar-touch
              ></ha-slider>
            `
        : ""}
        ${showToggle ? c.renderToggle(this.hass) : ""}
        ${showValue
        ? html`
                    <div class="container">
                        ${this._config.show_step_buttons
            ? html`
                                    <button
                                        class="button minus"
                                        @click=${this._decrementValue}
                                        .disabled=${this._value <= c.min}
                                        >
                                        <ha-icon icon="mdi:minus"></ha-icon>
                                    </button>
                                  `
            : ""}
                        <span class="value">
                            ${c.stateObj.state === "unavailable"
            ? this.hass.localize("state.default.unavailable")
            : c.formatValue(this._value)}
                        </span>
                        ${this._config.show_step_buttons
            ? html`
                                    <button
                                        class="button plus"
                                        @click=${this._incrementValue}
                                        .disabled=${this._value >= c.max}
                                        >
                                        <ha-icon icon="mdi:plus"></ha-icon>
                                    </button>
                                  `
            : ""}
                    </div>`
        : ""}
      </div>
    `;

    if (this._config.full_row)
      if (this._config.hide_when_off && c.isOff) return html``;
      else if (this._config.show_icon === true) {
        const conf = this._config as any;
        return html`
          <div class="wrapper">
            <state-badge
              .hass=${this.hass}
              .stateObj=${c.stateObj}
              .overrideIcon=${conf.icon}
              .overrideImage=${conf.image}
              .stateColor=${conf.state_color}
            ></state-badge>
            ${content}
          </div>
        `;
      } else return content;

    return html`
      <hui-generic-entity-row
        .hass=${this.hass}
        .config=${this._config}
        .catchInteraction=${false}
      >
        ${content}
      </hui-generic-entity-row>
    `;
  }

  static get styles() {
    return css`
      .wrapper {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 20px;
        flex: 7;
        height: 40px;
      }
      ha-entity-toggle {
        min-width: auto;
        margin-left: 8px;
      }
      ha-slider {
        width: 100%;
        min-width: 100px;
        --paper-slider-secondary-color: transparent;
      }
      ha-slider:not(.full) {
        max-width: 200px;
      }
      .container {
        box-sizing: border-box;
        flex: 0 0 auto;
        height: 100%;
        padding: 6px;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        border: none;
        background-color: rgba(var(--rgb-primary-text-color), 0.05);
        transition: background-color 280ms ease-in-out;
        height: 36px;
        overflow: hidden;
        font-size: var(--ha-font-size-m);
      }
      .button {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        padding: 4px;
        border: none;
        background: none;
        cursor: pointer;
        border-radius: 12px;
        line-height: 0;
        height: 100%;
      }
      .minus {
        padding-right: 0;
      }
      .plus {
        padding-left: 0;
      }
      .button:disabled {
        cursor: not-allowed;
      }
      .button:disabled ha-icon {
        color: var(--default-disabled);
      }
      .button ha-icon {
        font-size: 36px;
        --mdc-icon-size: 0.5em;
        color: var(--primary-text-color);
        pointer-events: none;
      }
      .value {
        text-align: center;
        flex-grow: 1;
        flex-shrink: 0;
        flex-basis: 20px;
        font-weight: 500;
        color: var(--primary-text-color);
      }
    `;
  }
}

if (!customElements.get("slider-entity-row")) {
  customElements.define("slider-entity-row", SliderEntityRow);
  console.info(
    `%cSLIDER-ENTITY-ROW ${pjson.version} IS INSTALLED`,
    "color: green; font-weight: bold",
    ""
  );
}
