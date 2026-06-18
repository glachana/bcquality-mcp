procedure HasOpenLines(): Boolean
var
    SalesLine: Record "Sales Line";
begin
    SalesLine.SetRange(Status, SalesLine.Status::Open);
    exit(not SalesLine.IsEmpty());
end;
