type FieldErrorProps = { message?: string };

function FieldError({ message }: FieldErrorProps) {
  if (!message) return null;

  return <p className="text-xs text-red-500">{message}</p>;
}

export default FieldError;
