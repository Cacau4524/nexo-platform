/**
 * Remove dados pessoais óbvios (e-mail, telefone, CPF, URLs) do texto antes de
 * enviá-lo a um serviço externo de IA. Não substitui o cuidado do usuário, mas
 * reduz o risco de vazamento de identificadores.
 */
export function redactPII(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[e-mail]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento]')
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, '[telefone]')
    .replace(/https?:\/\/\S+/g, '[link]');
}
