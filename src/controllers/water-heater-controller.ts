import { Controller } from "./controller";

export class WaterHeaterController extends Controller {
  get _value() {
    return this.stateObj.attributes.temperature;
  }

  set _value(value) {
    this._hass.callService("water_heater", "set_temperature", {
      entity_id: this.stateObj.entity_id,
      temperature: value,
    });
  }

  formatValue(value: number): string {
    return `${value} ${this._hass.config.unit_system.temperature}`;
  }

  get string() {
    return this.formatValue(this.value);
  }

  get isOff() {
    return this.stateObj.state === "off";
  }

  get _min() {
    return this.stateObj.attributes.min_temp;
  }
  get _max() {
    return this.stateObj.attributes.max_temp;
  }
  get _step() {
    return 1;
  }
}
