/**
 * Porta de exclusão simples: garante que só um pipeline rode por vez.
 * Falas que chegam enquanto há processamento em curso são descartadas
 * (fala simultânea não é o caso de uso do MVP).
 */
export function createBusyGate() {
  let busy = false;
  return {
    /** Tenta entrar. Retorna false se já houver processamento ativo. */
    tryEnter(): boolean {
      if (busy) return false;
      busy = true;
      return true;
    },
    /** Libera a porta para a próxima fala. */
    release(): void {
      busy = false;
    },
  };
}
