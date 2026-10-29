-- Reversión de 019: quita los tipos IRPF por ejercicio. Los cálculos vuelven a
-- leer app_config.irpf_tramos_tipos, que la subida no borró.
DROP TABLE IF EXISTS irpf_escalas;
