"use client";

import { runSafely } from "@/lib/client/safe-action";

// <form action={serverAction}> pero sin tumbar la página si la action falla:
// el error se muestra como aviso y, si es por una pestaña de un deploy
// anterior, recarga sola. Se usa desde server components (listas de videos),
// que no pueden envolver la action ellos mismos.
export function SafeForm({
  action,
  children,
  ...rest
}: { action: (formData: FormData) => Promise<unknown> } & Omit<React.FormHTMLAttributes<HTMLFormElement>, "action">) {
  return (
    <form
      {...rest}
      action={async (formData) => {
        await runSafely(() => action(formData));
      }}
    >
      {children}
    </form>
  );
}
