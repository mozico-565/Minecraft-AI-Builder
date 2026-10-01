// TEST ONLY: the pre-DDUI form classes used by the Android script.
export const shown: string[] = [];
class Form {
  private titleText = '';
  title(value: string) { this.titleText = value; return this; }
  body(_value: string) { return this; }
  button(_value: string) { return this; }
  button1(_value: string) { return this; }
  button2(_value: string) { return this; }
  textField(_label: string, _placeholder: string, _options?: object) { return this; }
  dropdown(_label: string, _items: string[], _options?: object) { return this; }
  slider(_label: string, _min: number, _max: number, _options?: object) { return this; }
  submitButton(_label: string) { return this; }
  async show(_player: unknown) { shown.push(this.titleText); return { canceled: true }; }
}
export class ActionFormData extends Form {}
export class MessageFormData extends Form {}
export class ModalFormData extends Form {}
