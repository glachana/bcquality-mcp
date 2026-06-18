procedure HasOpenLines(): Boolean
var
    SalesLine: Record "Sales Line";
begin
    SalesLine.SetRange(Status, SalesLine.Status::Open);
    exit(SalesLine.FindFirst()); // anti-pattern: loads a row we don't use
end;
