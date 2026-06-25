"""Error types for the OCR worker."""


class AppError:
    def __init__(self, code: str, message: str, technical_detail: str | None = None) -> None:
        self.code = code
        self.message = message
        self.technical_detail = technical_detail

    def to_dict(self) -> dict:
        result: dict = {"code": self.code, "message": self.message}
        if self.technical_detail:
            result["technical_detail"] = self.technical_detail
        return result

    def __repr__(self) -> str:
        return f"AppError(code={self.code!r}, message={self.message!r})"


class OcrError(AppError):
    def __init__(
        self,
        code: str,
        message: str,
        technical_detail: str | None = None,
        source_file: str | None = None,
    ) -> None:
        super().__init__(code, message, technical_detail)
        self.source_file = source_file

    def to_dict(self) -> dict:
        result = super().to_dict()
        if self.source_file:
            result["source_file"] = self.source_file
        return result
