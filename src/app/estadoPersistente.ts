import { useEffect, useState } from 'react'

/**
 * Como useState, mas lembra o valor entre sessões (salvo no localStorage) — usado pra estados de
 * UI tipo "expandido/recolhido" que devem voltar do jeito que o usuário deixou da última vez.
 */
export function useEstadoPersistente<T>(chave: string, valorPadrao: T): [T, (valor: T | ((prev: T) => T)) => void] {
  const [valor, setValor] = useState<T>(() => {
    try {
      const bruto = localStorage.getItem(chave)
      return bruto !== null ? (JSON.parse(bruto) as T) : valorPadrao
    } catch {
      return valorPadrao
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(chave, JSON.stringify(valor))
    } catch {
      // localStorage cheio ou indisponível — segue só pra essa sessão, sem lembrar da próxima vez
    }
  }, [chave, valor])

  return [valor, setValor]
}
